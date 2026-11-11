import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";
import { assertStudyLayout } from "./study-layout";

async function checked<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

for (const locale of ["es", "en"] as const) {
  test(`history and statistics reflect a confirmed review, filters and responsive layout (${locale})`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const email = await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!;
    const parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
      throw new Error("Synthetic fixtures are local only");
    const client = createClient<Database>(
      url,
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { data: auth, error: authError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (authError) throw authError;
    const user = auth.user;
    if (!user) throw new Error("Fixture owner required");
    const course = await checked(
      client.from("courses").select("id").eq("owner_id", user.id).single(),
    );
    const courseId = course!.id,
      deckId = randomUUID(),
      conceptId = randomUUID(),
      itemId = randomUUID();
    try {
      await checked(
        client.from("decks").insert({
          id: deckId,
          owner_id: user.id,
          course_id: courseId,
          title: "Original practice deck",
        }),
      );
      await checked(
        client.from("concepts").insert({
          id: conceptId,
          owner_id: user.id,
          course_id: courseId,
          kind: "vocabulary",
          title: "<script>Original title</script>",
          summary: "Original fixture",
        }),
      );
      await checked(
        client
          .from("deck_concepts")
          .insert({ deck_id: deckId, concept_id: conceptId, owner_id: user.id }),
      );
      await checked(
        client.from("practice_items").insert({
          id: itemId,
          owner_id: user.id,
          concept_id: conceptId,
          mode: "basic_recall",
          prompt_text: "Original question",
          answer_text: "Original answer",
          config: { mode: "basic_recall" },
        }),
      );
      await page.goto(`/${locale}/app/history`);
      await expect(
        page.getByRole("heading", {
          name:
            locale === "es" ? "No hay repasos en esta selección" : "No reviews in this selection",
        }),
      ).toBeVisible();
      await page.goto(`/${locale}/app/study?deck=${deckId}`);
      await page
        .getByRole("button", { name: locale === "es" ? "Crear sesión" : "Create session" })
        .click();
      await page
        .getByRole("button", { name: locale === "es" ? "Revelar respuesta" : "Reveal answer" })
        .click();
      await page
        .getByRole("button", { name: locale === "es" ? "Bien" : "Good", exact: true })
        .click();
      await expect(page.getByTestId("review-save-status")).toContainText(
        locale === "es" ? "Último repaso guardado" : "Last review saved",
      );
      await page.goto(`/${locale}/app/history`);
      await expect(
        page.getByRole("heading", { name: locale === "es" ? "Tu historial" : "Your history" }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "<script>Original title</script>", exact: true }),
      ).toBeVisible();
      expect(await page.locator("main script").count()).toBe(0);
      await page
        .getByText(locale === "es" ? "Ver detalles" : "View details", { exact: true })
        .click();
      await expect(
        page.getByText(
          locale === "es"
            ? "Vencimiento programado en ese repaso"
            : "Due date scheduled at that review",
          { exact: true },
        ),
      ).toBeVisible();
      await assertStudyLayout(page, info, `history-${locale}`);
      await page.screenshot({ path: info.outputPath(`history-${locale}.png`), fullPage: true });
      await page
        .getByLabel(locale === "es" ? "Valoración" : "Rating", { exact: true })
        .selectOption("again");
      await page
        .getByRole("button", { name: locale === "es" ? "Aplicar filtros" : "Apply filters" })
        .click();
      await expect(
        page.getByRole("heading", {
          name:
            locale === "es" ? "No hay repasos en esta selección" : "No reviews in this selection",
        }),
      ).toBeVisible();
      await page.goto(`/${locale}/app/history?from=2026-02-30`);
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      await page.goto(`/${locale}/app/statistics`);
      await expect(
        page.getByRole("heading", {
          name: locale === "es" ? "Entiende tu progreso" : "Understand your progress",
        }),
      ).toBeVisible();
      await expect(
        page
          .getByText("100%", { exact: true })
          .or(page.getByText("100 %", { exact: true }))
          .first(),
      ).toBeVisible();
      await expect(page.getByRole("meter")).not.toHaveCount(0);
      await page
        .getByText(locale === "es" ? "Por tipo de concepto" : "By concept type", { exact: true })
        .click();
      await page
        .getByText(locale === "es" ? "Por nivel del contenido" : "By content level", {
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("heading", {
          name: locale === "es" ? "Sin nivel asignado" : "No level assigned",
          exact: true,
        }),
      ).toBeVisible();
      await assertStudyLayout(page, info, `statistics-${locale}`);
      await page.screenshot({ path: info.outputPath(`statistics-${locale}.png`), fullPage: true });
      await page
        .getByLabel(locale === "es" ? "Periodo" : "Period", { exact: true })
        .selectOption("90");
      await page
        .getByRole("button", { name: locale === "es" ? "Aplicar filtros" : "Apply filters" })
        .click();
      await expect(page).toHaveURL(/days=90/);
      await expect(
        page.getByRole("heading", { name: locale === "es" ? "Memoria actual" : "Current memory" }),
      ).toBeVisible();
      await page.goto(`/${locale}/app/statistics?deck=${randomUUID()}`);
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        locale === "es" ? "No hemos podido consultar" : "We could not load",
      );
      await page
        .getByRole("button", { name: locale === "es" ? "Reintentar" : "Try again", exact: true })
        .click();
      await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
      expect(
        await checked(client.from("review_logs").select("id").eq("owner_id", user.id)),
      ).toHaveLength(1);
    } finally {
      await checked(client.from("courses").delete().eq("owner_id", user.id).eq("id", courseId));
      await client.auth.signOut();
    }
  });
}

test("history and statistics require authentication", async ({ page }) => {
  for (const path of ["/es/app/history", "/en/app/statistics"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/(es|en)\/login\?next=/);
  }
});
