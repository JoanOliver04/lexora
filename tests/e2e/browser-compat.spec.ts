import { expect, test, devices, type BrowserContext } from "@playwright/test";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";
import { checked, localLibraryFixture } from "./local-library-fixture";
import { assertStudyLayout } from "./study-layout";

for (const locale of ["es", "en"] as const) {
  test(`independent mobile login sees only confirmed desktop progress (${locale})`, async ({
    browser,
    baseURL,
  }, info) => {
    test.setTimeout(90_000);
    if (!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
      throw new Error("Compatibility acceptance requires a local app");
    const es = locale === "es";
    const colorScheme = info.project.use.colorScheme ?? "light";
    const desktopContext = await browser.newContext({
      baseURL,
      viewport: { width: 1440, height: 900 },
      colorScheme,
      // This scenario controls a real network request. PWA caching/upgrade has
      // separate coverage; a worker would bypass page.route in some engines.
      serviceWorkers: "block",
    });
    let mobileContext: BrowserContext | undefined;
    let fixture: Awaited<ReturnType<typeof localLibraryFixture>> | undefined;
    let release = () => {};
    const errors: string[] = [];
    try {
      const desktop = await desktopContext.newPage();
      desktop.on("pageerror", (error) => errors.push(error.message));
      const email = await signUp(desktop);
      await completeOnboarding(desktop, { uiLocale: locale });
      fixture = await localLibraryFixture(email);
      mobileContext = await browser.newContext({
        baseURL,
        viewport: { width: 393, height: 873 },
        colorScheme: colorScheme === "light" ? "dark" : "light",
        ...(browser.browserType().name() === "firefox"
          ? {}
          : {
              isMobile: true,
              hasTouch: true,
              userAgent:
                devices[browser.browserType().name() === "webkit" ? "iPhone 13" : "Pixel 5"]!
                  .userAgent,
              deviceScaleFactor: 2.75,
            }),
      });
      expect(await mobileContext.cookies()).toEqual([]);
      const mobile = await mobileContext.newPage();
      mobile.on("pageerror", (error) => errors.push(error.message));
      await mobile.goto(`/${locale}/app/history`);
      await expect(mobile).toHaveURL(new RegExp(`/${locale}/login\\?next=`));
      await mobile.getByLabel(es ? "Correo" : "Email", { exact: true }).fill(email);
      await mobile.getByLabel(es ? "Contraseña" : "Password", { exact: true }).fill(PASSWORD);
      await mobile.getByRole("button", { name: es ? "Entrar" : "Sign in", exact: true }).click();
      await expect(mobile).toHaveURL(`/${locale}/app/history`);
      const empty = mobile.getByRole("heading", {
        name: es ? "No hay repasos en esta selección" : "No reviews in this selection",
        exact: true,
      });
      await expect(empty).toBeVisible();

      await desktop.goto(`/${locale}/app/study?deck=${fixture.deckId}`);
      await desktop
        .getByRole("button", { name: es ? "Crear sesión" : "Create session", exact: true })
        .click();
      await expect(desktop.getByTestId("study-card")).toBeVisible();
      await desktop
        .getByRole("button", { name: es ? "Revelar respuesta" : "Reveal answer", exact: true })
        .click();
      await expect(desktop.getByText("An original answer", { exact: true })).toBeVisible();
      const easy = desktop.getByRole("button", { name: es ? "Fácil" : "Easy", exact: true });
      await desktopContext.setOffline(true);
      for (const name of es
        ? ["Otra vez", "Difícil", "Bien", "Fácil"]
        : ["Again", "Hard", "Good", "Easy"])
        await expect(desktop.getByRole("button", { name, exact: true })).toBeDisabled();
      await expect(desktop.getByText("An original answer", { exact: true })).toBeVisible();
      await desktopContext.setOffline(false);
      await expect(easy).toBeEnabled();
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let intercepted = 0;
      await desktop.route("**/api/study/reviews", async (route) => {
        intercepted++;
        await held;
        await route.continue();
      });
      await easy.click();
      await expect
        .poll(() => intercepted, { message: "The delayed review must reach interception" })
        .toBe(1);
      await expect(desktop.getByTestId("review-save-status")).toHaveText(
        es ? "Guardando repaso…" : "Saving review…",
      );
      await mobile.reload();
      await expect(empty).toBeVisible();
      expect(
        await checked(
          fixture.client.from("review_logs").select("id").eq("practice_item_id", fixture.itemId),
        ),
      ).toHaveLength(0);
      release();
      await expect(desktop.getByTestId("review-save-status")).toContainText(
        es ? "Último repaso guardado" : "Last review saved",
      );
      await mobile.reload();
      await expect(
        mobile.getByRole("link", { name: "Acceptance concept", exact: true }),
      ).toBeVisible();
      expect(
        await checked(
          fixture.client.from("review_logs").select("id").eq("practice_item_id", fixture.itemId),
        ),
      ).toHaveLength(1);
      await mobile.goto(`/${locale}/app`);
      await expect(mobile.getByTestId("week-reviews")).toHaveText("1");
      await assertStudyLayout(mobile, info, `compat-${locale}`);
      await mobile.screenshot({
        path: info.outputPath(`mobile-${locale}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await desktop.goto(`/${locale}/app`);
      await expect(desktop.getByTestId("week-reviews")).toHaveText("1");
      await desktop.screenshot({
        path: info.outputPath(`desktop-${locale}.png`),
        fullPage: true,
        animations: "disabled",
      });
      expect(errors).toEqual([]);
    } finally {
      release();
      await mobileContext?.close();
      await desktopContext.close();
      await fixture?.cleanup();
    }
  });
}
