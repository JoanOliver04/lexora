import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";
import { assertStudyLayout } from "./study-layout";

for (const locale of ["es", "en"] as const)
  test(`public-only offline fallback, update and explicit installation (${locale})`, async ({
    page,
    context,
  }, info) => {
    test.setTimeout(90000);
    await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    const manifestResponse = await page.request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();
    expect(manifest).toMatchObject({
      name: "Lexora",
      display: "standalone",
      scope: "/",
      start_url: "/app",
    });
    expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === "maskable")).toBe(
      true,
    );
    await page.goto(manifest.start_url);
    await expect(page).toHaveURL(`/${locale}/app`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
      .toContain("/sw.js");
    const headers = await page.request.get("/sw.js");
    expect(headers.headers()["cache-control"]).toContain("no-store");
    // The browser may expose its install event long before the settings route mounts.
    await page.evaluate(() => {
      const windowState = window as Window & { testInstallPrompts?: number };
      windowState.testInstallPrompts = 0;
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.defineProperties(event, {
        prompt: {
          value: async () => {
            windowState.testInstallPrompts!++;
          },
        },
        userChoice: { value: Promise.resolve({ outcome: "accepted" }) },
      });
      window.dispatchEvent(event);
    });
    await page
      .getByRole("link", { name: locale === "es" ? "Ajustes" : "Settings", exact: true })
      .click();
    const installation = page.getByRole("region", {
      name: locale === "es" ? "Lexora, más a mano" : "Lexora, close at hand",
    });
    await assertStudyLayout(page, info, `install-${locale}`);
    expect(
      await page.evaluate(
        () => (window as Window & { testInstallPrompts?: number }).testInstallPrompts,
      ),
    ).toBe(0);
    await installation
      .getByRole("button", { name: locale === "es" ? "Instalar Lexora" : "Install Lexora" })
      .click();
    expect(
      await page.evaluate(
        () => (window as Window & { testInstallPrompts?: number }).testInstallPrompts,
      ),
    ).toBe(1);
    await expect(installation.getByRole("status")).toContainText(
      locale === "es" ? "solicitada" : "requested",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(installation.getByRole("status")).toContainText(
      locale === "es" ? "instalada" : "installed",
    );
    // A new script URL exercises activation/claim on this disposable test origin.
    await page.evaluate(async () => {
      await caches.open("lexora-public-before-update");
      await caches.open("unrelated-test");
      await navigator.serviceWorker.register("/sw.js?revision=update-test", {
        scope: "/",
        updateViaCache: "none",
      });
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
      .toContain("revision=update-test");
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .not.toContain("lexora-public-before-update");
    const cacheState = await page.evaluate(async () => {
      const names = await caches.keys(),
        entries: { url: string; body: string }[] = [];
      for (const name of names.filter((name) => name.startsWith("lexora-public-"))) {
        const cache = await caches.open(name);
        for (const request of await cache.keys())
          entries.push({
            url: new URL(request.url).pathname,
            body: await (await cache.match(request))!.text(),
          });
      }
      return { names, entries };
    });
    expect(cacheState.names).toContain("unrelated-test");
    expect(cacheState.names).not.toContain("lexora-public-before-update");
    expect(cacheState.entries.map((entry) => entry.url).sort()).toEqual([
      "/icons/lexora.svg",
      "/offline.css",
      "/offline.html",
      "/offline.js",
    ]);
    for (const entry of cacheState.entries) expect(entry.body).not.toContain("access_token");
    await context.setOffline(true);
    await expect(
      page.getByText(
        locale === "es" ? "Tu dispositivo está sin conexión." : "Your device is offline.",
        { exact: false },
      ),
    ).toBeVisible();
    const api = await page.evaluate(() =>
      fetch("/api/health")
        .then(() => "unexpected-response")
        .catch(() => "network-error"),
    );
    expect(api).toBe("network-error");
    await page.goto(`/${locale}/app`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "es" ? "Conecta para seguir." : "Connect to carry on.",
    );
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("access_token");
    const original = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: original.height });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      321,
    );
    await page.screenshot({
      path: info.outputPath(`offline-${locale}-320-text-200.png`),
      fullPage: true,
    });
    await context.setOffline(false);
    await page
      .getByRole("button", { name: locale === "es" ? "Volver a intentar" : "Try again" })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "es" ? "Hoy" : "Today",
    );
  });
