import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { PASSWORD, signUp } from "./helpers";
import { localBackend } from "./local-backend";
import { audit } from "./a11y-audit";
import { assertStudyLayout } from "./study-layout";

for (const locale of ["es", "en"] as const) {
  test(`C1 onboarding, library persistence and filters (${locale})`, async ({ page }, info) => {
    test.setTimeout(90000);
    const es = locale === "es";
    const email = await signUp(page);
    await page.goto(`/${locale}/onboarding`);
    await expect(
      page.getByText(es ? "C1 — Avanzado" : "C1 — Advanced", { exact: true }),
    ).toHaveCount(2);
    await page.locator(`input[name="uiLocale"][value="${locale}"]`).check();
    await page.locator('input[name="declaredLevel"][value="C1"]').check();
    await page.locator('input[name="startLevel"][value="C1"]').check();
    await assertStudyLayout(page, info, `c1-onboarding-${locale}`);
    await audit(page, info, `c1-onboarding-${locale}`);
    await page
      .getByRole("button", { name: es ? "Crear mi curso" : "Create my course", exact: true })
      .click();
    await expect(page).toHaveURL(`/${locale}/app`);

    await page.goto(`/${locale}/decks`);
    for (const [title, level] of [
      ["Advanced C1 deck", "C1"],
      ["Retained B2 deck", "B2"],
    ]) {
      await page.locator('input[name="title"]').fill(title!);
      await page.locator("#deck-cefrLevel").selectOption(level!);
      await page
        .getByRole("button", { name: es ? "Crear mazo" : "Create deck", exact: true })
        .click();
      await expect(page.getByRole("link", { name: title!, exact: true })).toBeVisible();
    }
    await page.goto(`/${locale}/decks?cefrLevel=C1`);
    await expect(page.getByRole("link", { name: "Advanced C1 deck", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retained B2 deck", exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Advanced C1 deck", exact: true }).click();
    await expect(page.locator("#deck-cefrLevel")).toHaveValue("C1");

    await page.goto(`/${locale}/concepts`);
    for (const [title, level] of [
      ["Advanced C1 phrase", "C1"],
      ["Retained B2 phrase", "B2"],
    ]) {
      await page.locator('input[name="title"]').fill(title!);
      await page.locator('[name="summary"]').fill("Synthetic learning content");
      await page.locator("#concept-cefrLevel").selectOption(level!);
      await page
        .getByRole("button", { name: es ? "Crear concepto" : "Create concept", exact: true })
        .click();
      await expect(page.getByRole("link", { name: title!, exact: true })).toBeVisible();
    }
    await page.goto(`/${locale}/concepts?cefrLevel=C1`);
    await expect(page.getByRole("link", { name: "Advanced C1 phrase", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retained B2 phrase", exact: true })).toHaveCount(
      0,
    );
    await audit(page, info, `c1-filter-${locale}`);
    await page.getByRole("link", { name: "Advanced C1 phrase", exact: true }).click();
    await expect(page.locator("#concept-cefrLevel")).toHaveValue("C1");

    const backend = localBackend();
    const client = createClient(backend.url, backend.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signed = await client.auth.signInWithPassword({ email, password: PASSWORD });
    expect(signed.error).toBeNull();
    const course = await client.from("courses").select("declared_level,start_level").single();
    expect(course.error).toBeNull();
    expect(course.data).toEqual({ declared_level: "C1", start_level: "C1" });
    await client.auth.signOut({ scope: "local" });
  });
}
