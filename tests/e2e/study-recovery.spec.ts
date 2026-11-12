import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test as base } from "@playwright/test";

import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";
import { localBackend } from "./local-backend";

async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}
interface ReviewFixture {
  client: SupabaseClient<Database>;
  ids: string[];
  sessionId: string;
}
const test = base.extend<{ review: ReviewFixture }>({
  review: async ({ page }, provide) => {
    const { url, publishableKey } = localBackend();
    const email = await signUp(page);
    await completeOnboarding(page);
    const client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: auth, error: authError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (authError || !auth.user) throw new Error("Synthetic fixture requires identity");
    const ownerId = auth.user.id;
    const course = await checked(
      client.from("courses").select("id").eq("owner_id", ownerId).single(),
    );
    const courseId = course!.id;
    const deckId = randomUUID();
    const conceptId = randomUUID();
    const ids = Array.from({ length: 3 }, () => randomUUID()).sort();
    try {
      await checked(
        client.from("decks").insert({
          id: deckId,
          owner_id: ownerId,
          course_id: courseId,
          title: "Synthetic recovery deck",
        }),
      );
      await checked(
        client.from("concepts").insert({
          id: conceptId,
          owner_id: ownerId,
          course_id: courseId,
          kind: "vocabulary",
          title: "Synthetic recovery concept",
          summary: "Original",
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
            prompt_text: `Recovery front ${index}`,
            answer_text: `Recovery answer ${index}`,
            enabled: true,
            config: { mode: "basic_recall" },
          })),
        ),
      );
      await page.goto(`/es/app/study?deck=${deckId}`);
      await page.getByRole("button", { name: "Crear sesión" }).click();
      await expect(page).toHaveURL(/\/es\/app\/study\/[0-9a-f-]+$/);
      await provide({ client, ids, sessionId: new URL(page.url()).pathname.split("/").at(-1)! });
    } finally {
      await checked(client.from("courses").delete().eq("owner_id", ownerId).eq("id", courseId));
      await client.auth.signOut();
    }
  },
});

test("offline, lost acknowledgement and another device preserve one durable review per intent", async ({
  page,
  review,
}, testInfo) => {
  test.setTimeout(60_000);
  const { client, ids, sessionId } = review;
  const bodies: string[] = [];
  let release = () => {};
  const withheld = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/study/reviews", async (route) => {
    bodies.push(route.request().postData() ?? "");
    if (bodies.length !== 1) {
      await route.continue();
      return;
    }
    // Commit for real, but do not deliver its acknowledgement to the browser.
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await withheld;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Revelar respuesta" }).click();
    await expect(page.getByText("Recovery answer 0", { exact: true })).toBeVisible();
    await page.context().setOffline(true);
    await expect(page.getByText(/^Sin conexión\./)).toBeVisible();
    for (const name of ["Otra vez", "Difícil", "Bien", "Fácil"])
      await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
    await expect(page.getByText("Recovery answer 0", { exact: true })).toBeVisible();
    await page.context().setOffline(false);
    await expect(page.getByRole("button", { name: "Bien", exact: true })).toBeEnabled();
    expect(bodies).toHaveLength(0);

    await page.clock.install();
    await page.getByRole("button", { name: "Bien", exact: true }).click();
    await expect
      .poll(
        async () =>
          (await checked(
            client.from("review_logs").select("id").eq("study_session_id", sessionId),
          ))!.length,
      )
      .toBe(1);
    await page.clock.fastForward(15_100);
    await expect(page.locator("#study-review-error")).toContainText(
      "La confirmación ha tardado demasiado",
    );
    await expect(page.getByTestId("review-save-status")).toBeEmpty();
    await expect(page.getByText("Recovery answer 0", { exact: true })).toBeVisible();
    const saved = await checked(
      client.from("learning_states").select("*").eq("practice_item_id", ids[0]!).single(),
    );
    await page.screenshot({
      path: testInfo.outputPath("review-unknown.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Reintentar guardado", exact: true }).click();
    await expect(page.getByTestId("review-save-status")).toHaveText(
      "Último repaso guardado: Bien.",
    );
    await expect(page.getByText("Recovery front 1", { exact: true })).toBeVisible();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(
      await checked(client.from("review_logs").select("id").eq("study_session_id", sessionId)),
    ).toHaveLength(1);
    expect(
      await checked(
        client.from("learning_states").select("*").eq("practice_item_id", ids[0]!).single(),
      ),
    ).toEqual(saved);
    release();

    // A different authenticated device commits the already-revealed next item.
    await page.getByRole("button", { name: "Revelar respuesta" }).click();
    await expect(page.getByText("Recovery answer 1", { exact: true })).toBeVisible();
    const otherDevice = await page.context().newPage();
    try {
      const response = await otherDevice.request.post("/api/study/reviews", {
        headers: { origin: new URL(page.url()).origin },
        form: {
          locale: "es",
          sessionId,
          practiceItemId: ids[1]!,
          idempotencyKey: randomUUID(),
          rating: "hard",
          expectedRevision: "new",
        },
      });
      expect(response.status()).toBe(200);
      await page.getByRole("button", { name: "Bien", exact: true }).click();
      await expect(page.locator("#study-review-error")).toContainText(
        "Los pendientes han cambiado",
      );
      await expect(page.getByText("Recovery answer 1", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Bien", exact: true })).toBeDisabled();
      expect(
        await checked(client.from("review_logs").select("id").eq("study_session_id", sessionId)),
      ).toHaveLength(2);
      await page.screenshot({
        path: testInfo.outputPath("review-conflict.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Recargar sesión", exact: true }).click();
      await expect(page.getByText("Recovery front 2", { exact: true })).toBeVisible();
      await expect(page.getByText("Recovery answer 1", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Bien", exact: true })).toBeDisabled();
      await expect(page.getByRole("heading", { name: "Primer ítem", exact: true })).toBeFocused();
    } finally {
      await otherDevice.close();
    }
  } finally {
    release();
    await page.context().setOffline(false);
  }
});

test("review API rejects missing identity, cross-origin writes and oversized bodies", async ({
  request,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Review API tests require an explicit application origin");
  const response = await request.post("/api/study/reviews", {
    headers: { origin: new URL(baseURL).origin },
    form: {
      locale: "es",
      sessionId: randomUUID(),
      practiceItemId: randomUUID(),
      idempotencyKey: randomUUID(),
      rating: "good",
      expectedRevision: "new",
    },
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toMatchObject({ error: "unauthenticated" });
  expect(response.headers()["cache-control"]).toContain("private, no-store");
  const csrf = await request.post("/api/study/reviews", {
    headers: { origin: "https://evil.example" },
    form: { rating: "good" },
  });
  expect(csrf.status()).toBe(403);
  const oversized = await request.post("/api/study/reviews", {
    headers: {
      origin: new URL(baseURL).origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    data: "x".repeat(2049),
  });
  expect(oversized.status()).toBe(413);
});
