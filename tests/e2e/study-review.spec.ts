import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";
import { localBackend } from "./local-backend";

async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

test("ratings save once before advancing and survive closing the confirmed tab", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const email = await signUp(page);
  await completeOnboarding(page);
  const { url, publishableKey } = localBackend();
  const client = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: auth, error: authError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (authError || !auth.user) throw new Error("Synthetic fixture could not sign in");
  const ownerId = auth.user.id;
  const course = await checked(
    client.from("courses").select("id").eq("owner_id", ownerId).single(),
  );
  const courseId = course!.id;
  const deckId = randomUUID();
  const conceptId = randomUUID();
  const ids = Array.from({ length: 4 }, () => randomUUID()).sort();
  let studyPage = page;
  let release: () => void = () => {};
  try {
    await checked(
      client.from("decks").insert({
        id: deckId,
        course_id: courseId,
        owner_id: ownerId,
        title: "Synthetic review deck",
      }),
    );
    await checked(
      client.from("concepts").insert({
        id: conceptId,
        course_id: courseId,
        owner_id: ownerId,
        kind: "vocabulary",
        title: "Synthetic review concept",
        summary: "Original fixture",
      }),
    );
    await checked(
      client
        .from("deck_concepts")
        .insert({ owner_id: ownerId, deck_id: deckId, concept_id: conceptId }),
    );
    await checked(
      client.from("practice_items").insert(
        ids.map((id, index) => ({
          id,
          owner_id: ownerId,
          concept_id: conceptId,
          mode: "basic_recall" as const,
          prompt_text: `Review front ${index}`,
          answer_text: `Review answer ${index}`,
          enabled: true,
          config: { mode: "basic_recall" },
        })),
      ),
    );
    await page.goto(`/es/app/study?deck=${deckId}`);
    await page.getByRole("button", { name: "Crear sesión" }).click();
    await expect(page).toHaveURL(/\/es\/app\/study\/[0-9a-f-]+$/);
    const sessionPath = new URL(page.url()).pathname;
    const sessionId = sessionPath.split("/").at(-1)!;
    const captured: { url: string; body: string; headers: Record<string, string> }[] = [];
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/study/reviews", async (route) => {
      const request = route.request();
      const body = request.postData() ?? "";
      if (request.method() === "POST" && body.includes("idempotencyKey")) {
        captured.push({ url: request.url(), body, headers: request.headers() });
        if (captured.length === 1) await blocked;
      }
      await route.continue();
    });
    await expect(
      page.getByTestId("study-card").getByText("Review front 0", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Revelar respuesta" }).click();
    await expect(page.getByText("Review answer 0", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Bien", exact: true }).click();
    await expect(page.getByTestId("review-save-status")).toHaveText("Guardando repaso…");
    await expect(page.getByRole("button", { name: "Pausar sesión" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Abandonar sesión" })).toBeDisabled();
    for (const name of ["Otra vez", "Difícil", "Bien", "Fácil"])
      await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    await expect(page.getByText("Review front 0", { exact: true })).toBeVisible();
    await expect(page.getByText("Review answer 0", { exact: true })).toBeVisible();
    expect(
      await checked(client.from("review_logs").select("id").eq("study_session_id", sessionId)),
    ).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("review-saving.png"),
      fullPage: true,
      animations: "disabled",
    });
    release();
    await expect(page.getByTestId("review-save-status")).toHaveText(
      "Último repaso guardado: Bien.",
    );
    await expect(
      page.getByTestId("study-card").getByText("Review front 1", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Primer ítem", exact: true })).toBeFocused();
    await expect(page.getByText("Review answer 0", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bien", exact: true })).toBeDisabled();
    expect(captured).toHaveLength(1);
    const beforeReplay = await checked(
      client.from("learning_states").select("*").eq("practice_item_id", ids[0]!).single(),
    );
    expect(beforeReplay).toMatchObject({
      revision: 2,
      reps: 1,
      phase: "learning",
      config_version: "v1",
      scheduler_version: "5.4.2",
    });
    const original = captured[0]!;
    const replay = await page.request.post(original.url, {
      headers: {
        "content-type": original.headers["content-type"]!,
        origin: new URL(original.url).origin,
      },
      data: original.body,
    });
    expect(replay.status()).toBe(200);
    expect(
      await checked(
        client.from("learning_states").select("*").eq("practice_item_id", ids[0]!).single(),
      ),
    ).toEqual(beforeReplay);
    expect(
      await checked(client.from("review_logs").select("id").eq("study_session_id", sessionId)),
    ).toHaveLength(1);
    await page.screenshot({
      path: testInfo.outputPath("review-saved-next.png"),
      fullPage: true,
      animations: "disabled",
    });

    // Close the acknowledged tab; the new tab has no previous React state.
    studyPage = await page.context().newPage();
    await page.close();
    await studyPage.goto(sessionPath);
    await expect(
      studyPage.getByTestId("study-card").getByText("Review front 1", { exact: true }),
    ).toBeVisible();
    await expect(studyPage.getByTestId("session-available")).toContainText("3");
    await expect(studyPage.getByText("Review answer 0", { exact: true })).toHaveCount(0);
    const ratings = ["Difícil", "Fácil", "Otra vez"];
    for (let index = 1; index < ids.length; index++) {
      await expect(studyPage.getByText(`Review front ${index}`, { exact: true })).toBeVisible();
      await studyPage.getByRole("button", { name: "Revelar respuesta" }).click();
      await expect(studyPage.getByText(`Review answer ${index}`, { exact: true })).toBeVisible();
      const rating = ratings[index - 1]!;
      await studyPage.getByRole("button", { name: rating, exact: true }).click();
      await expect(studyPage.getByTestId("review-save-status")).toHaveText(
        `Último repaso guardado: ${rating}.`,
      );
    }
    await expect(studyPage.getByTestId("study-card")).toHaveCount(0);
    await expect(studyPage.getByTestId("review-save-status")).toBeFocused();
    await expect(studyPage.getByTestId("session-available")).toHaveText(
      "0 ítems disponibles ahora",
    );
    const logs = await checked(
      client
        .from("review_logs")
        .select("rating, practice_item_id, state_before, state_after, study_session_id")
        .eq("study_session_id", sessionId),
    );
    expect(logs).toHaveLength(4);
    expect(logs!.map((log) => log.rating).sort()).toEqual(["again", "easy", "good", "hard"]);
    const states = await checked(
      client.from("learning_states").select("revision, reps").in("practice_item_id", ids),
    );
    expect(states).toHaveLength(4);
    expect(states!.every((state) => state.revision === 2 && state.reps === 1)).toBe(true);
    await studyPage.screenshot({
      path: testInfo.outputPath("review-empty.png"),
      fullPage: true,
      animations: "disabled",
    });
  } finally {
    release();
    await checked(client.from("courses").delete().eq("owner_id", ownerId).eq("id", courseId));
    await client.auth.signOut();
    if (studyPage !== page) await studyPage.close();
  }
});
