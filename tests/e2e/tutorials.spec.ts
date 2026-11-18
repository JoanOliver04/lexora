import { expect, test } from "@playwright/test";
import { audit } from "./a11y-audit";
import { completeOnboarding, signUp } from "./helpers";
import { assertStudyLayout } from "./study-layout";

test("the help route keeps the private entry gate", async ({ page }) => {
  await page.goto("/es/app/help");
  await expect(page).toHaveURL("/es/login?next=%2Fes%2Fapp%2Fhelp");
});

for (const locale of ["es", "en"] as const) {
  test(`first session guide, sample card and contextual tutorials (${locale})`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    const es = locale === "es";
    await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    await page
      .getByRole("link", { name: es ? "Guía rápida de Lexora" : "Quick guide to Lexora" })
      .click();
    await expect(page).toHaveURL(`/${locale}/app/help`);
    const guide = page.getByRole("main");
    await expect(
      guide.getByRole("heading", { name: es ? "Tu primera sesión" : "Your first session" }),
    ).toBeVisible();
    await expect(
      guide
        .getByRole("navigation", { name: es ? "Temas de ayuda" : "Help topics" })
        .getByRole("link"),
    ).toHaveCount(6);

    await guide
      .getByRole("link", { name: es ? "Haz un repaso" : "Review a card", exact: true })
      .click();
    await expect(page).toHaveURL(`/${locale}/app/help#tutorial-study`);
    const example = guide.getByRole("region", {
      name: es ? "Prueba una tarjeta de ejemplo" : "Try a sample card",
    });
    const answer = example.getByText("Borrow", { exact: true });
    await expect(answer).toBeHidden();
    const reveal = example.locator("summary");
    await reveal.focus();
    await page.keyboard.press("Enter");
    await expect(answer).toBeVisible();
    await expect(example.getByText(es ? "Otra vez" : "Again", { exact: true })).toBeVisible();
    await assertStudyLayout(page, info, `tutorials-${locale}`);
    await audit(page, info, `tutorials-${locale}`);
    await page.screenshot({
      path: info.outputPath(`tutorials-${locale}.png`),
      animations: "disabled",
    });

    await guide
      .getByRole("link", { name: es ? "Preparar una sesión" : "Prepare a session" })
      .click();
    await expect(page).toHaveURL(`/${locale}/app/study`);
    const studyHint = page
      .getByRole("main")
      .locator("details")
      .filter({
        hasText: es ? "Cómo hacer un repaso" : "How to review a card",
      });
    await expect(studyHint).not.toHaveAttribute("open");
    await studyHint.locator("summary").click();
    await expect(studyHint.getByRole("listitem")).toHaveCount(4);
    await expect(studyHint.getByRole("listitem").first()).toBeVisible();
    await expect(page).toHaveURL(`/${locale}/app/study`);

    await page.goto(`/${locale}/import`);
    const importHint = page
      .getByRole("main")
      .locator("details")
      .filter({
        hasText: es ? "Cómo importar tarjetas" : "How to import cards",
      });
    await importHint.locator("summary").click();
    await expect(importHint.getByRole("listitem").last()).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page).toHaveURL(`/${locale}/import`);
  });
}
