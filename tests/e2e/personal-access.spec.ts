import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { PASSWORD, uniqueEmail } from "./helpers";
import { audit } from "./a11y-audit";
test.skip(
  process.env["LEXORA_TEST_PERSONAL_ACCESS"] !== "1",
  "Separate closed-registration production build",
);

for (const locale of ["es", "en"] as const)
  test(`closed registration preserves existing login (${locale})`, async ({ page }, info) => {
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
      parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
      throw new Error("Local synthetic account only");
    const client = createClient(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const email = uniqueEmail("personal-existing");
    const fixture = await client.auth.signUp({ email, password: PASSWORD });
    if (fixture.error) throw fixture.error;
    await client.auth.signOut();
    await page.goto(`/${locale}/signup`);
    await expect(
      page.getByRole("heading", { name: locale === "es" ? "Acceso personal" : "Personal access" }),
    ).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await audit(page, info, "closed-registration");
    await page.goto(`/${locale}/login`);
    await expect(page.locator('a[href$="/signup"]')).toHaveCount(0);
    await audit(page, info, "personal-login");
    await page.locator('[name="email"]').fill(email);
    await page.locator('[name="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(`/${locale}`);
    await expect(
      page.getByRole("link", { name: locale === "es" ? "Abrir mi espacio" : "Open my workspace" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: locale === "es" ? "Abrir mi espacio" : "Open my workspace" })
      .click();
    await expect(page).toHaveURL(`/${locale}/onboarding`);
  });
