import { expect, test } from "@playwright/test";
import { assertStudyLayout } from "./study-layout";

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
