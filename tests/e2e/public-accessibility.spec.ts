import { expect, test } from "@playwright/test";
import { assertStudyLayout } from "./study-layout";

test("Search Console receives the verification file directly at the root", async ({ request }) => {
  const filename = "google6ec811eafa695f08.html";
  const response = await request.get(`/${filename}`, {
    headers: { "Accept-Language": "en" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(200);
  expect(await response.body()).toEqual(Buffer.from(`google-site-verification: ${filename}`));
});

for (const locale of ["es", "en"] as const)
  test(`public footers credit the studio in the selected language (${locale})`, async ({
    page,
  }) => {
    const notice =
      locale === "es"
        ? "© 2026 JVOR Studios. Todos los derechos reservados."
        : "© 2026 JVOR Studios. All rights reserved.";
    for (const path of ["", "/demo", "/login", "/signup", "/privacy", "/terms"]) {
      await page.goto(`/${locale}${path}`);
      await expect(page.locator("footer").getByText(notice, { exact: true })).toBeVisible();
    }
  });

for (const locale of ["es", "en"] as const)
  test(`the public home offers a keyboard flashcard and links to privacy (${locale})`, async ({
    page,
  }, info) => {
    await page.goto(`/${locale}`);
    const spanish = locale === "es";
    const heading = spanish ? "Prueba una tarjeta" : "Try a flashcard";
    const example = page.getByRole("region", { name: heading });
    const control = example.locator("summary");
    const answer = example.getByText(
      spanish ? "Un pequeño avance cada día." : "A little progress every day.",
      { exact: true },
    );
    await expect(
      page.getByRole("link", { name: spanish ? "Crear una cuenta" : "Create an account" }),
    ).toHaveAttribute("href", `/${locale}/signup`);
    await expect(page.locator('a[href*="github.com"]')).toHaveCount(0);
    await expect(answer).toBeHidden();
    expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await control.focus();
    await control.press("Enter");
    await expect(answer).toBeVisible();
    await expect(control).toBeFocused();
    const continueDemo = example.getByRole("link", {
      name: spanish ? "Practicar el viaje a Brighton" : "Practise the trip to Brighton",
      exact: true,
    });
    await expect(continueDemo).toHaveAttribute("href", `/${locale}/demo`);
    await page.keyboard.press("Tab");
    await expect(continueDemo).toBeFocused();
    await assertStudyLayout(page, info, `home-example-${locale}`);
    await control.press("Enter");
    await expect(answer).toBeHidden();
    await page.getByRole("link", { name: spanish ? "Privacidad" : "Privacy", exact: true }).click();
    await expect(page).toHaveURL(`/${locale}/privacy`);
  });

for (const locale of ["es", "en"] as const)
  test(`the public terms open without signing in (${locale})`, async ({ page }, info) => {
    const spanish = locale === "es";
    const title = spanish ? "Condiciones del servicio" : "Terms of service";
    const path = `/${locale}/terms`;
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(path);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(
      page.getByRole("link", { name: spanish ? "Política de privacidad" : "Privacy Policy" }),
    ).toHaveAttribute("href", `/${locale}/privacy`);
    await assertStudyLayout(page, info, `terms-${locale}`);
    await page.getByRole("link", { name: spanish ? "Volver a Lexora" : "Back to Lexora" }).click();
    const policies = page.getByRole("navigation", {
      name: spanish ? "Privacidad y condiciones" : "Privacy and terms",
    });
    await expect(
      policies.getByRole("link", { name: spanish ? "Privacidad" : "Privacy" }),
    ).toHaveAttribute("href", `/${locale}/privacy`);
    await policies.getByRole("link", { name: title }).click();
    await expect(page).toHaveURL(path);
  });

for (const locale of ["es", "en"] as const)
  test(`the signup page links to the public policies (${locale})`, async ({ page }, info) => {
    await page.goto(`/${locale}/signup`);
    await expect(
      page.getByRole("link", {
        name: locale === "es" ? "Condiciones del servicio" : "Terms of service",
      }),
    ).toHaveAttribute("href", `/${locale}/terms`);
    const title = locale === "es" ? "Privacidad" : "Privacy";
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(`/${locale}/privacy`);
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(page.getByText("JVOR Studios", { exact: true })).toBeVisible();
    await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
    await assertStudyLayout(page, info, `privacy-${locale}`);
    await page
      .getByRole("link", { name: locale === "es" ? "Volver a Lexora" : "Back to Lexora" })
      .click();
    await expect(page).toHaveURL(`/${locale}`);
  });

for (const locale of ["es", "en"] as const)
  test(`public/auth reflow and native theme keyboard (${locale})`, async ({ page }, info) => {
    test.setTimeout(90000);
    await page.goto(`/${locale}/login`);
    const light = page.getByRole("radio", {
      name: locale === "es" ? "Claro" : "Light",
      exact: true,
    });
    await light.check();
    await light.focus();
    await page.keyboard.press("ArrowRight");
    const dark = page.getByRole("radio", {
      name: locale === "es" ? "Oscuro" : "Dark",
      exact: true,
    });
    await expect(dark).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    for (const radio of await page.getByRole("radio").all()) {
      const target = await radio.locator("..").boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
    }
    for (const route of ["", "/login", "/signup", "/forgot-password", "/reset-password"]) {
      await page.goto(`/${locale}${route}`);
      await assertStudyLayout(
        page,
        info,
        `public-${locale}-${route.replaceAll("/", "") || "home"}`,
      );
      const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
      const header = await page.locator("header").first().boundingBox();
      if (header && heading) expect(heading.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    }
  });

for (const locale of ["es", "en"] as const)
  test(`theme remains usable with browser storage blocked (${locale})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.addInitScript(() => {
      const get = Storage.prototype.getItem,
        set = Storage.prototype.setItem;
      Storage.prototype.getItem = function (this: Storage, key: string) {
        if (key === "lexora-theme")
          throw new DOMException("Test storage restriction", "SecurityError");
        return get.call(this, key);
      };
      Storage.prototype.setItem = function (this: Storage, key: string, value: string) {
        if (key === "lexora-theme")
          throw new DOMException("Test storage restriction", "SecurityError");
        set.call(this, key, value);
      };
    });
    await page.goto(`/${locale}/login`);
    const dark = page.getByRole("radio", {
      name: locale === "es" ? "Oscuro" : "Dark",
      exact: true,
    });
    const system = page.getByRole("radio", {
      name: locale === "es" ? "Sistema" : "System",
      exact: true,
    });
    await dark.check();
    await expect(dark).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await system.check();
    await expect(system).toBeChecked();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(system).toBeChecked();
  });
