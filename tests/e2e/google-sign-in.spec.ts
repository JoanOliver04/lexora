import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { localBackend } from "./local-backend";
import { audit, auditAxe } from "./a11y-audit";
import { assertStudyLayout } from "./study-layout";

// The provider is intercepted by Playwright. Keep the app's service worker
// from handling the mocked navigation and the subsequent return to Lexora.
test.use({ serviceWorkers: "block" });

/** No Google credentials, provider activation or external accounts. The denial is synthetic. */
for (const locale of ["es", "en"] as const) {
  test(`personal Google initiation and cancellation (${locale})`, async ({
    page,
    context,
    baseURL,
    browserName,
  }, info) => {
    test.setTimeout(90_000);
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
        cookies.some(
          (cookie) =>
            cookie.name.includes("code-verifier") && cookie.value.length > 20 && cookie.httpOnly,
        ),
      ).toBe(true);
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("error_description", "synthetic-private-provider-message");
      initiated = true;
      // Continue to the real callback so the browser follows its actual redirect.
      await route.continue({ url: callback.toString() });
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
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible({ timeout: 20_000 });
  });
}

test("Google-only deletion requests account selection and binds its cancellation to the browser", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const backend = localBackend();
  const auth = createClient(backend.url, backend.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `delete-google-${randomUUID()}@example.com`;
  const password = randomUUID();
  const fixture = await auth.auth.signUp({ email, password });
  const owner = fixture.data.user?.id;
  if (fixture.error || !owner || !/^[a-f0-9-]{36}$/.test(owner))
    throw new Error("Synthetic local owner required");
  const sql = (input: string) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_lexora",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input, encoding: "utf8", timeout: 30_000 },
    ).trim();
  try {
    await page.goto("/en/login");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL("/en", { timeout: 20_000 });
    // Model an already linked Google-only identity without contacting Google.
    sql(`begin;
      insert into auth.identities(provider_id,user_id,identity_data,provider,created_at,updated_at,last_sign_in_at)
      values('${owner}','${owner}','{"sub":"${owner}","email":"${email}"}','google',now(),now(),now());
      delete from auth.identities where user_id='${owner}' and provider='email';
      update auth.users set encrypted_password=null,raw_app_meta_data='{"provider":"google","providers":["google"]}' where id='${owner}' and email='${email}';
      commit;`);
    const identity = await auth.auth.getUser();
    expect(identity.error).toBeNull();
    expect(identity.data.user?.identities?.map((item) => item.provider)).toEqual(["google"]);
    let challengeObserved = false;
    await page.route("https://accounts.google.com/**", (route) => route.abort());
    await page.route(`${backend.url}/auth/v1/authorize?*`, async (route) => {
      const authorization = new URL(route.request().url());
      const callback = new URL(authorization.searchParams.get("redirect_to")!);
      expect(authorization.searchParams.get("provider")).toBe("google");
      expect(authorization.searchParams.get("prompt")).toBe("select_account");
      expect(authorization.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
      expect(callback.origin).toBe(baseURL);
      expect(callback.searchParams.get("flow")).toBe("deletion-google");
      const challenge = (await context.cookies(callback.toString())).find(
        (cookie) => cookie.name === "lexora-deletion-google",
      );
      expect(challenge?.httpOnly).toBe(true);
      expect(challenge?.path).toBe("/api/auth/callback");
      expect(challenge?.value.length).toBe(36);
      challengeObserved = true;
      callback.searchParams.set("error", "access_denied");
      await route.continue({ url: callback.toString() });
    });
    await page.goto("/en/app/settings");
    await page.locator("summary").filter({ hasText: "Review account deletion" }).click();
    await expect(page.getByLabel("Your current password")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Permanently delete my account" }),
    ).toBeDisabled();
    const started = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/en/app/settings",
    );
    await page.getByRole("button", { name: "Verify with Google" }).click();
    // Check the actual server-issued attributes. On Windows the WebKit cookie
    // inventory reports SameSite=None even for an explicit Lax response header.
    const responseCookies = await (await started).headerValues("set-cookie");
    const attributes =
      responseCookies
        .find((value) => value.startsWith("lexora-deletion-google="))
        ?.split(";")
        .slice(1)
        .map((value) => value.trim().toLowerCase()) ?? [];
    expect(attributes).toEqual(
      expect.arrayContaining(["samesite=lax", "httponly", "path=/api/auth/callback"]),
    );
    await expect(page).toHaveURL("/en/app/settings?verification=failed");
    expect(challengeObserved).toBe(true);
    await expect(page.getByText(/Google verification did not complete/)).toBeVisible();
    expect(sql(`select count(*) from auth.users where id='${owner}' and email='${email}'`)).toBe(
      "1",
    );
  } finally {
    sql(`delete from auth.users where id='${owner}' and email='${email}'`);
    await auth.auth.signOut();
  }
});
