import { expect, test } from "@playwright/test";
import { localBackend } from "./local-backend";
import { audit, auditAxe } from "./a11y-audit";
import { assertStudyLayout } from "./study-layout";

/** No Google credentials, provider activation or external accounts. The denial is synthetic. */
for (const locale of ["es", "en"] as const) {
  test(`personal Google initiation and cancellation (${locale})`, async ({
    page,
    context,
    baseURL,
    browserName,
  }, info) => {
    test.setTimeout(90000);
    const backend = localBackend();
    const label = locale === "es" ? "Continuar con Google" : "Continue with Google";
    let initiated = false;
    await page.route(`${backend.url}/auth/v1/authorize?*`, async (route) => {
      const url = new URL(route.request().url());
      expect(url.origin).toBe(new URL(backend.url).origin);
      expect(url.searchParams.get("provider")).toBe("google");
      expect(url.searchParams.get("scopes")).toBe("openid email profile");
      expect(url.searchParams.get("prompt")).toBe("select_account");
      expect(url.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
      expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const callback = new URL(url.searchParams.get("redirect_to")!);
      expect(callback.origin).toBe(baseURL);
      expect(callback.pathname).toBe("/api/auth/callback");
      expect(callback.searchParams.get("locale")).toBe(locale);
      expect(callback.searchParams.get("flow")).toBe("google");
      expect(callback.searchParams.get("next")).toBe(`/${locale}/app/library`);
      // Verify persistence without writing the verifier or cookies to a report.
      const cookies = await context.cookies(baseURL!);
      expect(
        cookies.some((cookie) => cookie.name.includes("code-verifier") && cookie.value.length > 20),
      ).toBe(true);
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("error_description", "synthetic-private-provider-message");
      initiated = true;
      // WebKit cannot fulfill a mocked HTTP redirect. A synthetic provider
      // document performs the same navigation without changing the app's CSP.
      const destination = callback.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;");
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        headers: {
          "cache-control": "no-store",
          "content-security-policy": "default-src 'none'; base-uri 'none'",
        },
        body: `<!doctype html><html lang="${locale}"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=${destination}"><title>Synthetic provider cancellation</title><body>Returning to Lexora.</body></html>`,
      });
    });
    // Fail explicitly if a future implementation attempts an actual Google navigation.
    await page.route("https://accounts.google.com/**", (route) => route.abort());
    await page.goto(`/${locale}/login?next=${encodeURIComponent(`/${locale}/app/library`)}`);
    await expect(page.locator('a[href$="/signup"]')).toHaveCount(0);
    const google = page.getByRole("button", { name: label, exact: true });
    await expect(google).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: info.outputPath(`google-${locale}-initial.png`),
      fullPage: true,
      animations: "disabled",
    });
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await assertStudyLayout(page, info, `google-${locale}`);
    // Full-document Tab wrapping is Chromium-specific: Windows Firefox stops at
    // the last native control and WebKit excludes links by default, even in a
    // minimal HTML fixture. Keep that existing audit intact and exercise the
    // actual form's forward/backward native Tab sequence in every engine.
    const auditRules = browserName === "chromium" ? audit : auditAxe;
    await auditRules(page, info, `google-${locale}`);
    await google.focus();
    await page.keyboard.press("Tab");
    await expect(page.locator('input[name="email"]')).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(google).toBeFocused();
    await expect(google).toHaveCSS("outline-style", "solid");
    await expect(google).toHaveCSS("outline-width", "2px");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/${locale}/login\\?error=google-unavailable`));
    expect(initiated).toBe(true);
    await expect(page.locator("#google-return-error")).toBeVisible();
    await expect(page.locator('input[name="email"]')).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator('input[name="password"]')).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(await page.content()).not.toContain("synthetic-private-provider-message");
    await expect(page.locator('form input[name="next"]').first()).toHaveValue(
      `/${locale}/app/library`,
    );
    await auditRules(page, info, `google-denied-${locale}`);
    // The existing email path still submits and reports its usual validation.
    await page.locator('input[name="email"]').fill("synthetic-google-fallback@example.com");
    await page.locator('input[name="password"]').fill("synthetic-invalid-password");
    await page
      .getByRole("button", { name: locale === "es" ? "Entrar" : "Sign in", exact: true })
      .click();
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  });
}
