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

for (const phase of ["learning", "relearning"] as const) {
  test(`${phase} waits are optional and a future browser clock never admits an early step`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60_000);
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
    const itemId = randomUUID();
    try {
      await checked(
        client.from("decks").insert({
          id: deckId,
          owner_id: ownerId,
          course_id: courseId,
          title: "Synthetic short steps",
        }),
      );
      await checked(
        client.from("concepts").insert({
          id: conceptId,
          owner_id: ownerId,
          course_id: courseId,
          kind: "vocabulary",
          title: "Original short step",
          summary: "Original",
        }),
      );
      await checked(
        client
          .from("deck_concepts")
          .insert({ owner_id: ownerId, deck_id: deckId, concept_id: conceptId }),
      );
      await checked(
        client.from("practice_items").insert({
          id: itemId,
          owner_id: ownerId,
          concept_id: conceptId,
          mode: "basic_recall",
          prompt_text: "Original step front",
          answer_text: "Original step answer",
          enabled: true,
          config: { mode: "basic_recall" },
        }),
      );
      if (phase === "relearning")
        await checked(
          client.from("learning_states").insert({
            owner_id: ownerId,
            practice_item_id: itemId,
            phase: "review",
            due_at: new Date(Date.now() - 60_000).toISOString(),
            last_reviewed_at: new Date(Date.now() - 86_400_000).toISOString(),
            stability: 5,
            difficulty: 4,
            reps: 5,
            scheduled_days: 1,
            learning_step: 0,
            lapses: 0,
            scheduler_version: "5.4.2",
            config_version: "v1",
          }),
        );
      await page.goto(`/es/app/study?deck=${deckId}`);
      await page.getByRole("button", { name: "Crear sesión" }).click();
      await expect(page).toHaveURL(/\/es\/app\/study\/[0-9a-f-]+$/);
      const sessionId = new URL(page.url()).pathname.split("/").at(-1)!;
      await page.getByRole("button", { name: "Revelar respuesta" }).click();
      await expect(page.getByText("Original step answer", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Otra vez", exact: true }).click();
      await expect(page.getByTestId("review-save-status")).toHaveText(
        "Último repaso guardado: Otra vez.",
      );
      const wait = page.getByTestId("study-step-wait");
      await expect(wait).toBeVisible();
      await expect(wait).toContainText(phase === "learning" ? "1 minuto" : "10 minutos");
      await expect(page.getByTestId("study-card")).toHaveCount(0);
      await expect(wait.getByRole("button", { name: "Comprobar pendientes" })).toBeEnabled();
      await expect(wait.getByRole("link", { name: "Volver a Hoy" })).toHaveAttribute(
        "href",
        "/es/app",
      );
      const firstState = await checked(
        client.from("learning_states").select("*").eq("practice_item_id", itemId).single(),
      );
      expect(firstState).toMatchObject({ phase, revision: 2 });
      await checked(
        client
          .from("course_settings")
          .update({ daily_new_limit: 0, maximum_reviews_per_day: 0 })
          .eq("course_id", courseId),
      );
      await page.screenshot({
        path: testInfo.outputPath(`step-wait-${phase}.png`),
        fullPage: true,
        animations: "disabled",
      });

      // Only the browser clock moves; the server must still reject early admission.
      await page.clock.setFixedTime(new Date(Date.now() + 86_400_000));
      const responsePromise = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === new URL(page.url()).pathname &&
          response.request().headers()["rsc"] === "1",
      );
      await wait.getByRole("button", { name: "Comprobar pendientes" }).click();
      await responsePromise;
      // RSC headers are not a UI commit. Wait for the refresh transition to settle
      // before changing the synthetic deadline; the stream itself may stay open.
      await expect(wait.getByRole("button", { name: "Comprobar pendientes" })).toBeEnabled();
      await expect(wait).toBeVisible();
      await expect(page.getByTestId("study-card")).toHaveCount(0);
      expect(
        await checked(
          client.from("learning_states").select("*").eq("practice_item_id", itemId).single(),
        ),
      ).toEqual(firstState);
      expect(
        await checked(client.from("review_logs").select("id").eq("study_session_id", sessionId)),
      ).toHaveLength(1);

      // Accelerate this synthetic fixture's deadline, not the product/server clock.
      await checked(
        client
          .from("learning_states")
          .update({ due_at: new Date(Date.now() - 1000).toISOString() })
          .eq("owner_id", ownerId)
          .eq("practice_item_id", itemId),
      );
      await wait.getByRole("button", { name: "Comprobar pendientes" }).click();
      await expect(page.getByText("Original step front", { exact: true })).toBeVisible();
      await expect(wait).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Bien", exact: true })).toBeDisabled();
      await expect(page.getByText("Original step answer", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Primer ítem", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Revelar respuesta" }).click();
      await expect(page.getByText("Original step answer", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Bien", exact: true }).click();
      await expect(page.getByTestId("review-save-status")).toHaveText(
        "Último repaso guardado: Bien.",
      );
      const state = await checked(
        client.from("learning_states").select("revision").eq("practice_item_id", itemId).single(),
      );
      expect(state?.revision).toBe(3);
      const logs = await checked(
        client
          .from("review_logs")
          .select("idempotency_key, rating")
          .eq("study_session_id", sessionId),
      );
      expect(logs).toHaveLength(2);
      expect(new Set(logs!.map((log) => log.idempotency_key)).size).toBe(2);
      expect(logs!.map((log) => log.rating).sort()).toEqual(["again", "good"]);
    } finally {
      await checked(client.from("courses").delete().eq("owner_id", ownerId).eq("id", courseId));
      await client.auth.signOut();
    }
  });
}
