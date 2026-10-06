import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

import { recentStudyDays } from "../../src/modules/study/domain/study-activity";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";

async function checked<T>(
  query: PromiseLike<{ data: T; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

test.describe("Today dashboard", () => {
  test("session routes remain protected and preserve the return destination", async ({
    page,
    request,
  }) => {
    await page.goto("/es/app/study");
    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fapp%2Fstudy$/);
    const path = `/en/app/study/${randomUUID()}`;
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["cache-control"]).toContain("no-store");
  });
  test("empty ES/EN dashboard and invalid filter recover through localized navigation", async ({
    page,
  }) => {
    await signUp(page);
    await completeOnboarding(page);
    await expect(page.getByRole("heading", { name: "Hoy", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prepara tu primer repaso" })).toBeVisible();
    await expect(page.getByTestId("today-newAvailable")).toHaveText("0");
    await expect(page.getByRole("list", { name: "Últimos siete días" }).locator("li")).toHaveCount(
      7,
    );
    await expect(page.getByRole("button", { name: "Empezar sesión" })).toBeDisabled();
    await expect(page.getByRole("link", { name: "Importar vocabulario" })).toHaveAttribute(
      "href",
      "/es/import",
    );
    await page.goto("/en/app");
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prepare your first review" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Import vocabulary" })).toHaveAttribute(
      "href",
      "/en/import",
    );
    await page.goto("/en/app/study");
    await expect(page.getByRole("heading", { name: "Prepare your session" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create session" })).toBeDisabled();
    await page.goto(`/en/app?deck=${randomUUID()}`);
    await expect(
      page.getByText("That filter can't be applied. Return to all decks to continue."),
    ).toBeVisible();
    const clear = page.getByRole("link", { name: "View all decks" });
    await clear.focus();
    await expect(clear).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/en/app");
    await expect(page.getByRole("heading", { name: "Prepare your first review" })).toBeVisible();
  });

  test("real counts, seven-day activity, last filter, dark mode and enlarged text", async ({
    page,
  }, testInfo) => {
    const email = await signUp(page);
    await completeOnboarding(page);
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
      throw new Error("Dashboard E2E fixtures require local Supabase");
    const client = createClient<Database>(
      url,
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { data: auth, error: authError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (authError || !auth.user)
      throw new Error("Could not authenticate the synthetic dashboard fixture");
    const ownerId = auth.user.id;
    const courses = await checked(
      client.from("courses").select("id").eq("owner_id", ownerId).single(),
    );
    const courseId = courses!.id;
    const deck = randomUUID();
    const otherDeck = randomUUID();
    const concept = randomUUID();
    const otherConcept = randomUUID();
    const itemIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const now = new Date();
    const days = recentStudyDays(now, "Europe/Madrid");
    try {
      await checked(
        client.from("decks").insert([
          { id: deck, owner_id: ownerId, course_id: courseId, title: "Vocabulario cotidiano" },
          { id: otherDeck, owner_id: ownerId, course_id: courseId, title: "Otros temas" },
        ]),
      );
      await checked(
        client.from("concepts").insert(
          [concept, otherConcept].map((id) => ({
            id,
            owner_id: ownerId,
            course_id: courseId,
            kind: "vocabulary" as const,
            title: "Synthetic dashboard example",
            summary: "Original fixture content",
          })),
        ),
      );
      await checked(
        client.from("deck_concepts").insert([
          { owner_id: ownerId, deck_id: deck, concept_id: concept },
          { owner_id: ownerId, deck_id: otherDeck, concept_id: otherConcept },
        ]),
      );
      await checked(
        client.from("practice_items").insert(
          itemIds.map((id, index) => ({
            id,
            owner_id: ownerId,
            concept_id: index === 3 ? otherConcept : concept,
            mode: "basic_recognition" as const,
            prompt_text: "Synthetic prompt",
            answer_text: "Synthetic answer",
            config: { mode: "basic_recognition" },
          })),
        ),
      );
      await checked(
        client.from("learning_states").insert({
          owner_id: ownerId,
          practice_item_id: itemIds[0]!,
          phase: "review",
          due_at: new Date(now.getTime() - 60_000).toISOString(),
          lapses: 3,
          scheduler_version: "5.4.2",
          config_version: "v1",
        }),
      );
      await checked(
        client.from("review_logs").insert(
          [
            { reviewedAt: now, phase: "review", duration: 20_000 },
            { reviewedAt: now, phase: "review", duration: 30_000 },
            { reviewedAt: new Date(days[0]!.start.getTime() + 1000), phase: "new", duration: null },
          ].map((row) => ({
            owner_id: ownerId,
            practice_item_id: itemIds[0]!,
            idempotency_key: randomUUID(),
            rating: "good" as const,
            reviewed_at: row.reviewedAt.toISOString(),
            duration_ms: row.duration,
            state_before: { phase: row.phase },
            state_after: { phase: "review" },
            due_before: now.toISOString(),
            due_after: now.toISOString(),
            scheduler_version: "5.4.2",
            config_version: "v1",
          })),
        ),
      );
      await checked(
        client.from("study_sessions").insert({
          owner_id: ownerId,
          course_id: courseId,
          scope: { deckIds: [deck] },
          started_at: now.toISOString(),
        }),
      );
      await page.goto("/es/app");
      await expect(page.getByTestId("today-available")).toHaveText("4");
      await expect(page.getByTestId("today-dueReviews")).toHaveText("1");
      await expect(page.getByTestId("today-newAvailable")).toHaveText("3");
      await expect(page.getByTestId("today-difficultItems")).toHaveText("1");
      await expect(page.getByTestId("week-reviews")).toHaveText("3");
      await expect(page.getByTestId("week-new")).toHaveText("1");
      await expect(page.getByText("Hoy has realizado 2 repasos.")).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath("today-es-light.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("link", { name: "Volver al último filtro" }).click();
      await expect(page).toHaveURL(`/es/app?deck=${deck}`);
      await expect(page.getByText("1 mazo seleccionado", { exact: true })).toBeVisible();
      await expect(page.getByText("Vocabulario cotidiano", { exact: true })).toBeVisible();
      await expect(page.getByTestId("today-available")).toHaveText("3");
      await expect(page.getByTestId("week-reviews")).toHaveText("3");
      await page.getByRole("link", { name: "Ver todos los mazos" }).click();
      await expect(page.getByTestId("today-available")).toHaveText("4");
      await page.goto(`/es/app?deck=${deck}`);
      await page.getByRole("link", { name: "Empezar sesión" }).click();
      await expect(page).toHaveURL(`/es/app/study?deck=${deck}`);
      await expect(page.getByRole("radio", { name: "Elegir algunos mazos" })).toBeChecked();
      const selectedDeck = page.getByRole("checkbox", { name: "Vocabulario cotidiano" });
      await expect(selectedDeck).toBeChecked();
      const selectedSessionId = await page.locator('input[name="sessionId"]').inputValue();
      await selectedDeck.uncheck();
      await page.getByRole("button", { name: "Crear sesión" }).click();
      await expect(
        page.getByText(
          "Elige al menos un mazo activo de este curso, hasta un máximo de 100, o selecciona todos los mazos.",
        ),
      ).toBeVisible();
      await expect(page.getByRole("group", { name: "Mazos del curso" })).toBeFocused();
      await expect(page.getByRole("radio", { name: "Elegir algunos mazos" })).toBeChecked();
      expect(
        await checked(client.from("study_sessions").select("id").eq("id", selectedSessionId)),
      ).toEqual([]);
      await selectedDeck.check();
      // Extra browser fields cannot override the server-derived owner, course or clock.
      await page.locator("form").evaluate((form) => {
        for (const [name, value] of [
          ["ownerId", "forged-owner"],
          ["courseId", "forged-course"],
          ["startedAt", "2099-01-01T00:00:00Z"],
        ]) {
          const field = document.createElement("input");
          field.type = "hidden";
          field.name = name!;
          field.value = value!;
          form.appendChild(field);
        }
      });
      await page.getByRole("button", { name: "Crear sesión" }).click();
      await expect(page).toHaveURL(`/es/app/study/${selectedSessionId}`);
      await expect(page.getByRole("heading", { name: "Sesión preparada" })).toBeVisible();
      await expect(
        page.getByTestId("study-card").getByText("Synthetic prompt", { exact: true }),
      ).toBeVisible();
      expect(await page.content()).not.toContain("Synthetic answer");
      await expect(page.getByTestId("session-available")).toHaveText("3 ítems disponibles ahora");
      const selectedRow = await checked(
        client
          .from("study_sessions")
          .select("owner_id, course_id, scope, started_at, status, ended_at")
          .eq("id", selectedSessionId)
          .single(),
      );
      expect(selectedRow).toMatchObject({
        owner_id: ownerId,
        course_id: courseId,
        scope: { deckIds: [deck] },
        status: "active",
        ended_at: null,
      });
      expect(selectedRow!.started_at).not.toContain("2099");
      await page.reload();
      await expect(page.getByTestId("session-available")).toHaveText("3 ítems disponibles ahora");
      expect(
        await checked(client.from("study_sessions").select("id").eq("id", selectedSessionId)),
      ).toHaveLength(1);
      await page.screenshot({
        path: testInfo.outputPath("study-session-es.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.goto("/en/app/study");
      await expect(page.getByRole("radio", { name: "All active decks" })).toBeChecked();
      const allSessionId = await page.locator('input[name="sessionId"]').inputValue();
      expect(allSessionId).not.toBe(selectedSessionId);
      await page.screenshot({
        path: testInfo.outputPath("study-scope-en.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.getByRole("button", { name: "Create session" }).click();
      await expect(page).toHaveURL(`/en/app/study/${allSessionId}`);
      await expect(page.getByTestId("session-available")).toHaveText("4 items available now");
      expect(
        await checked(
          client.from("study_sessions").select("scope").eq("id", allSessionId).single(),
        ),
      ).toEqual({ scope: { deckIds: null } });
      const otherContext = await page.context().browser()!.newContext();
      try {
        const otherPage = await otherContext.newPage();
        await signUp(otherPage);
        await completeOnboarding(otherPage);
        const denied = await otherPage.goto(`/es/app/study/${selectedSessionId}`);
        expect(denied?.status()).toBe(404);
        await expect(otherPage.getByText("This page could not be found.")).toBeVisible();
      } finally {
        await otherContext.close();
      }
      await page.goto("/en/app");
      await expect(page.getByRole("heading", { name: "Your next step starts here" })).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.dataset["theme"] = "dark";
      });
      await page.screenshot({
        path: testInfo.outputPath("today-en-dark.png"),
        fullPage: true,
        animations: "disabled",
      });
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      await expect(page.getByRole("link", { name: "Start session" })).toBeVisible();
    } finally {
      // Only the synthetic course created by this test's onboarding is removed.
      await checked(client.from("courses").delete().eq("owner_id", ownerId).eq("id", courseId));
      await client.auth.signOut();
    }
  });
});
