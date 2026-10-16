import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";

async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

test("pause and fresh resume preserve saved reviews, while terminal sessions stay closed", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
    throw new Error("Session lifecycle fixtures require local Supabase");
  const email = await signUp(page);
  await completeOnboarding(page);
  const client = createClient<Database>(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: auth, error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !auth.user) throw new Error("Synthetic fixture requires a user");
  const ownerId = auth.user.id;
  const course = await checked(
    client.from("courses").select("id").eq("owner_id", ownerId).single(),
  );
  const courseId = course!.id;
  const deckId = randomUUID();
  const conceptId = randomUUID();
  const [first, second] = [randomUUID(), randomUUID()].sort() as [string, string];
  const replacement = randomUUID();
  const item = (id: string, front: string) => ({
    id,
    owner_id: ownerId,
    concept_id: conceptId,
    mode: "basic_recall" as const,
    prompt_text: front,
    answer_text: `${front} answer`,
    config: { mode: "basic_recall" },
  });
  try {
    await checked(
      client.from("decks").insert({
        id: deckId,
        owner_id: ownerId,
        course_id: courseId,
        title: "Synthetic lifecycle deck",
      }),
    );
    await checked(
      client.from("concepts").insert({
        id: conceptId,
        owner_id: ownerId,
        course_id: courseId,
        title: "Original lifecycle concept",
        summary: "Original fixture",
        kind: "vocabulary",
      }),
    );
    await checked(
      client
        .from("deck_concepts")
        .insert({ owner_id: ownerId, deck_id: deckId, concept_id: conceptId }),
    );
    await checked(
      client
        .from("practice_items")
        .insert([item(first, "First lifecycle front"), item(second, "Old pending front")]),
    );
    await page.goto(`/es/app/study?deck=${deckId}`);
    await page.getByRole("button", { name: "Crear sesión" }).click();
    await expect(page).toHaveURL(/\/es\/app\/study\/[0-9a-f-]+$/);
    const sessionPath = new URL(page.url()).pathname;
    const sessionId = sessionPath.split("/").at(-1)!;
    await page.getByRole("button", { name: "Revelar respuesta" }).click();
    await expect(page.getByText("First lifecycle front answer", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Bien", exact: true }).click();
    await expect(page.getByText("Old pending front", { exact: true })).toBeVisible();
    const memoryBefore = await checked(
      client.from("learning_states").select("*").eq("practice_item_id", first).single(),
    );
    await page.getByRole("button", { name: "Pausar sesión" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sesión pausada" })).toBeVisible();
    await expect(page.getByTestId("study-card")).toHaveCount(0);
    expect(
      await checked(
        client.from("study_sessions").select("status, ended_at").eq("id", sessionId).single(),
      ),
    ).toEqual({ status: "paused", ended_at: null });
    await page.reload();
    await expect(page.getByRole("button", { name: "Reanudar sesión" })).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath("session-paused.png"),
      fullPage: true,
      animations: "disabled",
    });

    // Even if daily limits prevent creating a new session, open sessions remain discoverable.
    await checked(
      client
        .from("course_settings")
        .update({ daily_new_limit: 0, maximum_reviews_per_day: 0 })
        .eq("course_id", courseId),
    );
    await page.goto("/es/app");
    await expect(page.getByRole("button", { name: "Empezar sesión" })).toBeDisabled();
    await page.getByRole("link", { name: "Ver sesiones abiertas" }).click();
    const open = page.getByTestId("open-sessions");
    await open.getByRole("link", { name: /Sesión pausada/ }).click();
    await expect(page).toHaveURL(new RegExp(`${sessionPath}$`));
    // A second device edits the pending content while this session is paused.
    await checked(client.from("practice_items").update({ enabled: false }).eq("id", second));
    await checked(
      client.from("practice_items").insert(item(replacement, "Current replacement front")),
    );
    await checked(
      client
        .from("course_settings")
        .update({ daily_new_limit: 5, maximum_reviews_per_day: null })
        .eq("course_id", courseId),
    );
    await page.getByRole("button", { name: "Reanudar sesión" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sesión activa" })).toBeVisible();
    await expect(page.getByText("Current replacement front", { exact: true })).toBeVisible();
    await expect(page.getByText("Old pending front", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Bien", exact: true })).toBeDisabled();
    expect(
      await checked(
        client.from("learning_states").select("*").eq("practice_item_id", first).single(),
      ),
    ).toEqual(memoryBefore);
    await page.getByRole("button", { name: "Revelar respuesta" }).click();
    await expect(page.getByText("Current replacement front answer", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Bien", exact: true }).click();
    await expect(page.getByRole("button", { name: "Completar esta sesión" })).toBeEnabled();
    await page.getByRole("button", { name: "Completar esta sesión" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sesión completada" })).toBeVisible();
    await expect(page.getByTestId("session-controls")).toHaveCount(0);
    await expect(page.getByText(/Puede haber repasos futuros u ocultos/)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("session-completed.png"),
      fullPage: true,
      animations: "disabled",
    });
    const completed = await checked(
      client.from("study_sessions").select("status, ended_at, scope").eq("id", sessionId).single(),
    );
    expect(completed).toMatchObject({
      status: "completed",
      ended_at: expect.any(String),
      scope: { deckIds: [deckId] },
    });
    await page.reload();
    await expect(page.getByRole("button", { name: "Reanudar sesión" })).toHaveCount(0);
    expect(
      await checked(client.from("review_logs").select("id").eq("study_session_id", sessionId)),
    ).toHaveLength(2);

    await checked(client.from("practice_items").insert(item(randomUUID(), "Abandon front")));
    await page.goto(`/es/app/study?deck=${deckId}`);
    await page.getByRole("button", { name: "Crear sesión" }).click();
    await expect(page.getByText("Abandon front", { exact: true })).toBeVisible();
    const abandonedId = new URL(page.url()).pathname.split("/").at(-1)!;
    await page.getByRole("button", { name: "Pausar sesión" }).click();
    await expect(page.getByRole("button", { name: "Reanudar sesión" })).toBeEnabled();
    await page.getByRole("button", { name: "Abandonar sesión" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sesión abandonada" })).toBeVisible();
    await expect(page.getByTestId("study-card")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reanudar sesión" })).toHaveCount(0);
    expect(
      await checked(
        client.from("study_sessions").select("status, ended_at").eq("id", abandonedId).single(),
      ),
    ).toMatchObject({ status: "abandoned", ended_at: expect.any(String) });
    expect(
      await checked(
        client.from("learning_states").select("*").eq("practice_item_id", first).single(),
      ),
    ).toEqual(memoryBefore);
    expect(
      await checked(client.from("review_logs").select("id").eq("study_session_id", abandonedId)),
    ).toHaveLength(0);
    await page.screenshot({
      path: testInfo.outputPath("session-abandoned.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.goto("/es/app/study");
    await expect(page.getByTestId("open-sessions")).toHaveCount(0);
  } finally {
    await checked(client.from("courses").delete().eq("owner_id", ownerId).eq("id", courseId));
    await client.auth.signOut();
  }
});
