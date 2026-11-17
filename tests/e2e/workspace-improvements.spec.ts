import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";
import { audit } from "./a11y-audit";
import { assertStudyLayout } from "./study-layout";

// Network interception must reach the page rather than a previously installed worker.
test.use({ serviceWorkers: "block" });

for (const locale of ["es", "en"] as const) {
  test(`library query recovery and confirmed archive feedback (${locale})`, async ({
    page,
  }, info) => {
    test.setTimeout(90000);
    const es = locale === "es";
    await signUp(page);
    await expect(
      page.getByRole("button", { name: es ? "Accesos rápidos" : "Quick navigation", exact: true }),
    ).toHaveCount(0);
    await completeOnboarding(page, { uiLocale: locale });
    for (const path of ["concepts", "decks"]) {
      const response = await page.goto(
        `/${locale}/${path}?q=missing&q=ignored&page=999999999999999999999`,
      );
      expect(response?.status()).toBe(200);
      await expect(
        page.getByRole("heading", {
          name: path === "concepts" ? (es ? "Conceptos" : "Concepts") : es ? "Mazos" : "Decks",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator('input[name="q"]')).toHaveValue("missing");
      await page.goto(`/${locale}/${path}?q=missing&cefrLevel=C1&archived=1&page=999`);
      await expect(page).toHaveURL(new RegExp(`/${path}\\?`));
      expect(new URL(page.url()).searchParams.has("page")).toBe(false);
      await page
        .getByRole("link", { name: es ? "Quitar filtro: C1" : "Remove filter: C1", exact: true })
        .click();
      await expect(page).toHaveURL(
        (url) => !url.searchParams.has("cefrLevel") && url.pathname.endsWith(`/${path}`),
      );
      const url = new URL(page.url());
      expect(url.searchParams.get("q")).toBe("missing");
      expect(url.searchParams.get("archived")).toBe("1");
      expect(url.searchParams.has("cefrLevel")).toBe(false);
      await assertStudyLayout(page, info, `library-${path}-${locale}`);
      await audit(page, info, `library-${path}-${locale}`);
      await page.screenshot({
        path: info.outputPath(`${path}-${locale}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
    await page.goto(`/${locale}/decks`);
    await page.locator('input[name="title"]').fill("Synthetic pending archive");
    await page
      .getByRole("button", { name: es ? "Crear mazo" : "Create deck", exact: true })
      .click();
    const deck = page.getByRole("link", { name: "Synthetic pending archive", exact: true });
    await expect(deck).toBeVisible();
    const row = page.locator(".collection-item").filter({ has: deck });
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let intercepted = 0;
    await page.route("**/decks", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      intercepted++;
      await held;
      await route.continue();
    });
    try {
      await row.getByRole("button", { name: es ? "Archivar" : "Archive", exact: true }).click();
      await expect.poll(() => intercepted).toBe(1);
      const saving = row.getByRole("button", { name: es ? "Guardando…" : "Saving…", exact: true });
      await expect(saving).toBeDisabled();
      await expect(saving).toHaveAttribute("aria-busy", "true");
      await expect(deck).toBeVisible();
      release();
      await expect(deck).toHaveCount(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });

  test(`quick navigation search, focus and keyboard (${locale})`, async ({ page }, info) => {
    test.setTimeout(60000);
    const es = locale === "es";
    await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    const trigger = page.getByRole("button", {
      name: es ? "Accesos rápidos" : "Quick navigation",
      exact: true,
    });
    let releaseScripts = () => {};
    const scriptsHeld = new Promise<void>((resolve) => {
      releaseScripts = resolve;
    });
    await page.route("**/_next/static/**/*.js", async (route) => {
      await scriptsHeld;
      await route.continue();
    });
    try {
      await page.reload({ waitUntil: "commit" });
      await expect(trigger).toBeDisabled();
      await expect(
        page.getByRole("navigation", {
          name: es ? "Navegación principal" : "Main navigation",
          exact: true,
        }),
      ).toBeVisible();
    } finally {
      releaseScripts();
      await page.unrouteAll({ behavior: "wait" });
    }
    await expect(trigger).toBeEnabled();
    await trigger.click();
    const dialog = page.getByRole("dialog", {
      name: es ? "¿Adónde quieres ir?" : "Where would you like to go?",
      exact: true,
    });
    const search = dialog.getByRole("searchbox");
    await expect(search).toBeFocused();
    await search.fill("zzzz-no-destination");
    await expect(dialog.getByRole("status")).toContainText(
      es ? "No hay coincidencias" : "No matches",
    );
    await search.fill(es ? "estadisticas" : "statistics");
    await expect(dialog.getByRole("link")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Control+k");
    await expect(dialog).toBeVisible();
    await expect(search).toHaveValue("");
    await search.fill(es ? "nuevo concepto" : "new concept");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/${locale}/concepts#new-concept`);
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("#new-concept")).toBeInViewport();
    await page.locator('input[name="title"]').fill("Draft kept while navigating commands");
    await page.keyboard.press("Control+k");
    await expect(search).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator('input[name="title"]')).toBeFocused();
    await expect(page.locator('input[name="title"]')).toHaveValue(
      "Draft kept while navigating commands",
    );
    await trigger.click();
    await search.fill(es ? "importar" : "import");
    await audit(page, info, `commands-${locale}`);
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 480 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await dialog.getByRole("link").scrollIntoViewIfNeeded();
    const geometry = await dialog.evaluate((node) => ({
      width: node.scrollWidth,
      available: node.clientWidth,
      root: document.documentElement.scrollWidth,
    }));
    expect(geometry.root).toBeLessThanOrEqual(321);
    expect(geometry.width).toBeLessThanOrEqual(geometry.available + 1);
    await expect(dialog.getByRole("link")).toBeInViewport();
    await expect(dialog.getByRole("link").locator("strong")).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: info.outputPath(`commands-narrow-text200-${locale}.png`),
      animations: "disabled",
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize(viewport);
    await search.focus();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("link")).toBeFocused();
    await page.screenshot({
      path: info.outputPath(`commands-${locale}.png`),
      animations: "disabled",
    });
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/${locale}/import`);
    await expect(dialog).not.toBeVisible();
  });
}
