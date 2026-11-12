import { audit } from "./a11y-audit";
import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";
import { localLibraryFixture } from "./local-library-fixture";
import { assertStudyLayout } from "./study-layout";

for (const locale of ["es", "en"] as const) {
  test(`critical flows have no automated A/AA violations (${locale})`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const es = locale === "es";
    for (const path of ["", "/login", "/signup", "/forgot-password", "/reset-password"]) {
      await page.goto(`/${locale}${path}`);
      await audit(page, info, `public${path.replaceAll("/", "-") || "-home"}`);
    }
    await page.goto(`/${locale}/login`);
    await page.getByRole("button", { name: es ? "Entrar" : "Sign in", exact: true }).click();
    await expect(page.locator("#login-error")).toBeVisible();
    await expect(page.getByLabel(es ? "Correo" : "Email", { exact: true })).toBeFocused();
    await audit(page, info, "login-error");
    const email = await signUp(page);
    await page.goto(`/${locale}/onboarding`);
    await audit(page, info, "onboarding");
    await completeOnboarding(page, { uiLocale: locale });
    const fixture = await localLibraryFixture(email);
    try {
      for (const [stage, path] of [
        ["today", "/app"],
        ["decks", "/decks"],
        ["deck", `/decks/${fixture.deckId}`],
        ["concepts", "/concepts"],
        ["concept", `/concepts/${fixture.conceptId}`],
        ["item", `/concepts/${fixture.conceptId}/items/${fixture.itemId}`],
        ["import", "/import"],
        ["settings", "/app/settings"],
        ["data", "/app/settings/data"],
      ] as const) {
        await page.goto(`/${locale}${path}`);
        await audit(page, info, stage);
      }
      await page.goto(`/${locale}/import`);
      await page.locator('input[type="file"]').setInputFiles({
        name: "acceptance.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Original front\tOriginal back\toriginal\n"),
      });
      await page
        .getByRole("button", { name: es ? "Previsualizar" : "Preview", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 2, name: es ? "Mapeo de columnas" : "Column mapping" }),
      ).toBeVisible();
      await audit(page, info, "import-mapping");
      for (const [stage, heading] of [
        ["import-deck", es ? "Mazo e inversa" : "Deck and reverse"],
        ["import-duplicates", es ? "Duplicados" : "Duplicates"],
        ["import-confirm", es ? "Confirmar importación" : "Confirm import"],
      ] as const) {
        await page
          .getByRole("button", { name: es ? "Continuar" : "Continue", exact: true })
          .click();
        await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
        await audit(page, info, stage);
      }
      await page.goto(`/${locale}/app/study?deck=${fixture.deckId}`);
      await audit(page, info, "study-setup");
      await page
        .getByRole("button", { name: es ? "Crear sesión" : "Create session", exact: true })
        .click();
      await expect(page.getByTestId("study-card")).toBeVisible();
      await expect(page.getByText("An original answer", { exact: true })).toHaveCount(0);
      await audit(page, info, "study-front");
      await page
        .getByRole("button", { name: es ? "Revelar respuesta" : "Reveal answer", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText("An original answer", { exact: true })).toBeVisible();
      await audit(page, info, "study-revealed");
      await assertStudyLayout(page, info, `audit-revealed-${locale}`);
      await page.getByRole("button", { name: es ? "Fácil" : "Easy", exact: true }).click();
      await expect(page.getByTestId("review-save-status")).toContainText(
        es ? "Último repaso guardado" : "Last review saved",
      );
      await audit(page, info, "study-summary");
      for (const path of ["/app/history", "/app/statistics"]) {
        await page.goto(`/${locale}${path}`);
        await audit(page, info, path.split("/").at(-1)!);
      }
      await page.goto(`/${locale}/app/settings`);
      await page
        .getByRole("region", {
          name: es ? "Eliminar tu cuenta" : "Delete your account",
          exact: true,
        })
        .locator("summary")
        .click();
      await audit(page, info, "deletion-confirmation");
    } finally {
      await fixture.cleanup();
    }
  });
}
