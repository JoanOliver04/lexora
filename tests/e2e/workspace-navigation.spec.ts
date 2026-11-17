import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";
import { assertStudyLayout } from "./study-layout";

for (const locale of ["es", "en"] as const) {
  test(`workspace navigation remains reachable and identifies the current section (${locale})`, async ({
    page,
  }, info) => {
    test.setTimeout(60000);
    const es = locale === "es";
    await page.goto(`/${locale}`);
    await page.screenshot({
      path: info.outputPath("home-light.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page.goto(`/${locale}/login`);
    await page.screenshot({
      path: info.outputPath("login-light.png"),
      fullPage: true,
      animations: "disabled",
    });
    await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    await expect(page.getByTestId("today-available")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const nav = page.getByRole("navigation", {
      name: es ? "Navegación principal" : "Main navigation",
      exact: true,
    });
    await expect(nav).toHaveCount(1);
    await expect(
      nav.getByRole("link", { name: es ? "Hoy" : "Today", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.screenshot({
      path: info.outputPath("today-light.png"),
      fullPage: true,
      animations: "disabled",
    });
    await nav.getByRole("link", { name: es ? "Mis mazos" : "My decks", exact: true }).click();
    await expect(page).toHaveURL(`/${locale}/decks`);
    await expect(
      nav.getByRole("link", { name: es ? "Mis mazos" : "My decks", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await nav
      .getByRole("link", { name: es ? "Mis conceptos" : "My concepts", exact: true })
      .click();
    await expect(page).toHaveURL(`/${locale}/concepts`);
    await expect(
      nav.getByRole("link", { name: es ? "Mis conceptos" : "My concepts", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await assertStudyLayout(page, info, "workspace-concepts");
    await page.getByRole("link", { name: es ? "Importar" : "Import", exact: true }).click();
    await expect(page).toHaveURL(`/${locale}/import`);
    await nav.getByRole("link", { name: es ? "Hoy" : "Today", exact: true }).click();
    await expect(page).toHaveURL(`/${locale}/app`);
    await expect(page.getByTestId("today-available")).toBeVisible();
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.screenshot({
      path: info.outputPath("today-dark.png"),
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("link", { name: es ? "Ir al contenido" : "Skip to content", exact: true })
      .focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#workspace-content")).toBeFocused();
  });
}
