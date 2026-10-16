import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";

async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/** Traverse the real tab order; fail rather than focus a missed control by script. */
async function tabTo(page: Page, control: Locator) {
  for (let step = 0; step < 35; step++) {
    if (await control.evaluate((node) => node === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(control).toBeFocused();
}

for (const locale of ["es", "en"] as const) {
  test(`${locale}: keyboard study preserves native controls, focus, privacy and confirmed saves`, async ({
    page,
    context,
  }, testInfo) => {
    test.setTimeout(60_000);
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
      throw new Error("Keyboard fixtures require local Supabase");
    const email = await signUp(page);
    await completeOnboarding(page);
    const client = createClient<Database>(
      url,
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      },
    );
    const { data: auth, error } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (error || !auth.user) throw new Error("Synthetic fixture requires a user");
    const ownerId = auth.user.id;
    const course = await checked(
      client.from("courses").select("id").eq("owner_id", ownerId).single(),
    );
    const courseId = course!.id;
    const deckId = randomUUID();
    const conceptId = randomUUID();
    const ids = [randomUUID(), randomUUID()].sort();
    const es = locale === "es";
    const labels = {
      create: es ? "Crear sesión" : "Create session",
      reveal: es ? "Revelar respuesta" : "Reveal answer",
      answer: es ? "Respuesta" : "Answer",
      intervals: es ? "Mostrar intervalos aproximados" : "Show approximate intervals",
      again: es ? "Otra vez" : "Again",
      hard: es ? "Difícil" : "Hard",
      good: es ? "Bien" : "Good",
      easy: es ? "Fácil" : "Easy",
      pause: es ? "Pausar sesión" : "Pause session",
      resume: es ? "Reanudar sesión" : "Resume session",
      complete: es ? "Completar esta sesión" : "Complete this session",
      summary: es ? "Resumen de esta sesión" : "This session's summary",
      refresh: es ? "Actualizar resumen" : "Refresh summary",
    };
    let release = () => {};
    try {
      await checked(
        client.from("decks").insert({
          id: deckId,
          owner_id: ownerId,
          course_id: courseId,
          title: "Synthetic keyboard deck",
        }),
      );
      await checked(
        client.from("concepts").insert({
          id: conceptId,
          owner_id: ownerId,
          course_id: courseId,
          title: "Original keyboard concept",
          kind: "vocabulary",
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
            prompt_text: `Keyboard front ${index + 1}`,
            answer_text: `KEYBOARD_ANSWER_${index + 1}`,
            config: { mode: "basic_recall" },
          })),
        ),
      );
      await page.goto(`/${locale}/app/study?deck=${deckId}`);
      await tabTo(page, page.getByRole("button", { name: labels.create, exact: true }));
      await page.keyboard.press("Enter");
      const card = page.getByTestId("study-card");
      // The shared heading's actual translation is taken from its stable landmark.
      const front = card.locator("#study-card-heading");
      await expect(front).toBeFocused();
      await expect(front).toHaveAccessibleDescription(/Keyboard front 1/);
      expect(await card.ariaSnapshot()).not.toContain("KEYBOARD_ANSWER");
      expect(await page.content()).not.toContain("KEYBOARD_ANSWER");
      for (const key of ["1", "2", "3", "4", "Control+Space"]) await page.keyboard.press(key);
      await expect(card.getByRole("heading", { name: labels.answer, exact: true })).toHaveCount(0);
      expect(
        await checked(client.from("review_logs").select("id").eq("owner_id", ownerId)),
      ).toEqual([]);
      expect(await front.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
      await page.keyboard.press("Space");
      const answer = card.getByRole("heading", { name: labels.answer, exact: true });
      await expect(answer).toBeFocused();
      await expect(answer).toHaveAccessibleDescription(/KEYBOARD_ANSWER_1/);
      const revealButtons = card.getByRole("button");
      for (const button of await revealButtons.all()) {
        const bounds = await button.boundingBox();
        expect(bounds?.height).toBeGreaterThanOrEqual(44);
        expect(bounds?.width).toBeGreaterThanOrEqual(44);
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      const good = card.getByRole("button", { name: labels.good, exact: true });
      expect(
        await good.evaluate((node) => parseFloat(getComputedStyle(node).transitionDuration)),
      ).toBeLessThan(0.001);
      // Offline never queues a keyboard rating; reconnect never submits it automatically.
      await context.setOffline(true);
      await expect(good).toBeDisabled();
      await page.keyboard.press("3");
      await context.setOffline(false);
      await expect(good).toBeEnabled();
      expect(
        await checked(client.from("review_logs").select("id").eq("owner_id", ownerId)),
      ).toEqual([]);
      let calls = 0;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/api/study/reviews", async (route) => {
        calls++;
        await gate;
        await route.continue();
      });
      await page.keyboard.press("3");
      await expect(good).toBeDisabled();
      await expect(page.getByRole("button", { name: labels.pause, exact: true })).toBeDisabled();
      await page.keyboard.press("3");
      await page.keyboard.press("4");
      await expect(page.getByTestId("review-save-status")).toContainText(
        es ? "Guardando" : "Saving",
      );
      expect(calls).toBe(1);
      release();
      await expect(card.getByText("Keyboard front 2", { exact: true })).toBeVisible();
      await expect(front).toBeFocused();
      await page.unroute("**/api/study/reviews");
      expect(await card.ariaSnapshot()).not.toContain("KEYBOARD_ANSWER");
      await tabTo(page, page.getByRole("button", { name: labels.pause, exact: true }));
      await page.keyboard.press("Enter");
      const summaryHeading = page.getByRole("heading", { name: labels.summary, exact: true });
      await expect(summaryHeading).toBeFocused();
      await page.keyboard.press("4");
      await page.keyboard.press("Tab");
      const refresh = page.getByRole("button", { name: labels.refresh, exact: true });
      await expect(refresh).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(refresh).toBeEnabled();
      await expect(refresh).toBeFocused();
      await tabTo(page, page.getByRole("button", { name: labels.resume, exact: true }));
      await page.keyboard.press("Enter");
      await expect(front).toBeFocused();
      await page.keyboard.press("Tab");
      const reveal = card.getByRole("button", { name: labels.reveal, exact: true });
      await expect(reveal).toBeFocused();
      await page.keyboard.press("Space");
      await expect(answer).toBeFocused();
      await expect(answer).toHaveAccessibleDescription(/KEYBOARD_ANSWER_2/);
      await page.keyboard.press("Tab");
      const intervals = card.getByRole("checkbox", { name: labels.intervals });
      await expect(intervals).toBeFocused();
      await page.keyboard.press("Space");
      await expect(intervals).not.toBeChecked();
      await page.keyboard.press("3");
      await expect(card.getByTestId("interval-good")).toHaveCount(0);
      const labelBounds = await intervals.locator("..").boundingBox();
      expect(labelBounds?.height).toBeGreaterThanOrEqual(44);
      for (const label of [labels.again, labels.hard, labels.good, labels.easy]) {
        await page.keyboard.press("Tab");
        await expect(card.getByRole("button", { name: label, exact: true })).toBeFocused();
      }
      await page.keyboard.press("Shift+Tab");
      await expect(good).toBeFocused();
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      await expect(card).toHaveCount(0);
      await expect(page.getByTestId("review-save-status")).toBeFocused();
      const logs = await checked(
        client.from("review_logs").select("rating").eq("owner_id", ownerId).order("reviewed_at"),
      );
      expect(logs).toEqual([{ rating: "good" }, { rating: "easy" }]);
      await tabTo(page, page.getByRole("button", { name: labels.complete, exact: true }));
      await page.keyboard.press("Enter");
      await expect(summaryHeading).toBeFocused();
      await expect(page.getByTestId("summary-reviews")).toHaveText("2");
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`keyboard-summary-${locale}.png`),
        fullPage: true,
      });
    } finally {
      release();
      await context.setOffline(false);
      await page.unroute("**/api/study/reviews");
      await checked(client.from("courses").delete().eq("owner_id", ownerId).eq("id", courseId));
      await client.auth.signOut();
    }
  });
}
