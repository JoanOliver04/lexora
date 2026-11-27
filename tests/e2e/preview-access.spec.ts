import { expect, test } from "@playwright/test";
import { audit } from "./a11y-audit";
for (const locale of ["es", "en"] as const)
  test(`manual preview cannot reach personal access (${locale})`, async ({
    page,
    request,
    baseURL,
  }, info) => {
    const backendRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).port === "54321" || request.url().includes(".supabase.co"))
        backendRequests.push(request.url());
    });
    for (const path of [
      "login",
      "signup",
      "forgot-password",
      "reset-password",
      "app",
      "onboarding",
      "decks",
      "concepts",
      "import",
    ]) {
      await page.goto(`/${locale}/${path}`);
      await expect(
        page.getByRole("heading", {
          name: locale === "es" ? "Vista previa de Lexora" : "Lexora preview",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator("input[type=email], input[type=password], form")).toHaveCount(0);
    }
    await page.goto(`/${locale}/login`);
    const demo = page.getByRole("link", {
      name: locale === "es" ? "Probar la demo sin registro" : "Try the demo without an account",
      exact: true,
    });
    await expect(demo).toHaveAttribute("href", `/${locale}/demo`);
    await audit(page, info, "preview-auth-information");
    await demo.click();
    await expect(page).toHaveURL(`/${locale}/demo`);
    await expect(
      page.getByRole("button", {
        name: locale === "es" ? "Revelar significado" : "Reveal meaning",
      }),
    ).toBeVisible();
    await page.goto(`/${locale}/import`);
    expect(backendRequests).toEqual([]);
    await audit(page, info, "preview-information");
    const health = await request.get("/api/health");
    expect(health.status()).toBe(503);
    expect(await health.json()).toMatchObject({ app: true, database: false });
    const exported = await request.post("/api/account/export", {
      headers: { Origin: baseURL! },
      data: { format: "json" },
    });
    expect(exported.status()).toBe(403);
    for (const path of ["/api/account/delete", "/api/study/reviews", "/api/import/jobs"]) {
      const response = await request.post(path, { data: {}, headers: { Origin: baseURL! } });
      expect(response.status()).toBe(403);
      expect(response.headers()["cache-control"]).toContain("no-store");
    }
    const callback = await request.get(`/api/auth/callback?code=synthetic&locale=${locale}`, {
      maxRedirects: 0,
    });
    expect(callback.status()).toBe(307);
    expect(callback.headers()["location"]).toContain(`/${locale}/login`);
  });
