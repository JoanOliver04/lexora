import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";

test("CSP blocks a parser-inserted inline script and permits the theme and hydration", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("lexora-theme", "dark");
    const state = window as Window & { blockedDirectives?: string[] };
    state.blockedDirectives = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      state.blockedDirectives!.push(event.effectiveDirective),
    );
  });
  await page.route(
    "**/en/login",
    async (route) => {
      const response = await route.fetch();
      const html = (await response.text()).replace(
        "</head>",
        "<script>window.untrustedInlineExecuted=true;</script></head>",
      );
      await route.fulfill({ response, body: html });
    },
    { times: 1 },
  );
  const response = await page.goto("/en/login");
  const headers = response!.headers();
  const policy = headers["content-security-policy"]!;
  expect(policy).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/]{32}' 'strict-dynamic'/);
  expect(policy.split(";").find((part) => part.trim().startsWith("script-src "))).not.toMatch(
    /unsafe-inline|unsafe-eval/,
  );
  expect(headers["cache-control"]).toContain("no-store");
  await expect(page.getByRole("heading", { name: "Sign in to Lexora" })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as Window & { untrustedInlineExecuted?: boolean }).untrustedInlineExecuted,
    ),
  ).toBeUndefined();
  await expect
    .poll(() =>
      page.evaluate(() => (window as Window & { blockedDirectives?: string[] }).blockedDirectives),
    )
    .toContain("script-src-elem");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: "Light", exact: true }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(
    await page.evaluate(() =>
      [...document.scripts]
        .filter((script) => !script.textContent?.includes("untrustedInlineExecuted"))
        .every((script) => Boolean(script.nonce)),
    ),
  ).toBe(true);
});

test("HTML nonces change between responses; static, API and dotted 404 routes keep security headers", async ({
  request,
}) => {
  const first = await request.get("/en/login");
  const second = await request.get("/en/login");
  expect(first.headers()["content-security-policy"]).not.toBe(
    second.headers()["content-security-policy"],
  );
  for (const path of [
    "/api/health",
    "/offline.html",
    "/sw.js",
    "/icons/lexora.svg",
    "/en/unknown.page",
  ]) {
    const response = await request.get(path);
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers()["permissions-policy"]).toContain("microphone=()");
    if (path === "/offline.html")
      expect(response.headers()["content-security-policy"]).toContain("script-src 'self'");
    if (path === "/en/unknown.page") {
      expect(response.status()).toBe(404);
      expect(response.headers()["content-security-policy"]).toContain("'nonce-");
    }
  }
});

test("an expired cookie session refreshes and persists without losing the authenticated page", async ({
  page,
  context,
}) => {
  await signUp(page);
  await completeOnboarding(page);
  const authCookies = (await context.cookies()).filter((cookie) =>
    /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name),
  );
  expect(authCookies.length).toBeGreaterThan(0);
  const sorted = authCookies.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  const encoded = sorted.map((cookie) => cookie.value).join("");
  expect(encoded.startsWith("base64-")).toBe(true);
  const session = JSON.parse(Buffer.from(encoded.slice(7), "base64url").toString("utf8")) as {
    expires_at: number;
    expires_in: number;
    refresh_token: string;
  };
  const previousRefresh = session.refresh_token;
  // Stop app prefetches before replacing individual cookie chunks. Otherwise
  // the synthetic edit can send an intentionally incomplete JSON cookie.
  await page.goto("about:blank");
  session.expires_at = 1;
  session.expires_in = 0;
  const expired = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const baseName = sorted[0]!.name.replace(/\.\d+$/, "");
  await context.clearCookies({ name: /^sb-.+-auth-token(?:\.\d+)?$/ });
  const chunks = expired.match(/.{1,2000}/g)!;
  await context.addCookies(
    chunks.map((value, index) => ({
      ...sorted[0]!,
      name: chunks.length === 1 ? baseName : `${baseName}.${index}`,
      value,
    })),
  );
  await page.goto("/es/app");
  await expect(page).toHaveURL("/es/app");
  await expect(page.getByRole("heading", { name: "Inglés", exact: true })).toBeVisible();
  const renewed = (await context.cookies())
    .filter((cookie) => /^sb-.+-auth-token(?:\.\d+)?$/.test(cookie.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((cookie) => cookie.value)
    .join("");
  const saved = JSON.parse(Buffer.from(renewed.slice(7), "base64url").toString("utf8")) as {
    expires_at: number;
    refresh_token: string;
  };
  expect(saved.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
  expect(saved.refresh_token).not.toBe(previousRefresh);
  await page.reload();
  await expect(page).toHaveURL("/es/app");
});
