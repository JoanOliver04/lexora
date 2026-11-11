import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";
import { assertStudyLayout } from "./study-layout";

for (const locale of ["es", "en"] as const)
  test(`export before explicit self deletion, stale tab and denied login (${locale})`, async ({
    page,
    browser,
  }, info) => {
    // Backup, four layout variants, two Auth attempts, stale context and login.
    test.setTimeout(60000);
    const email = await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
      parsed = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || parsed.port !== "54321")
      throw new Error("Synthetic local deletion only");
    const client = createClient(url, process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auth = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (auth.error || !auth.data.user) throw new Error("Expected synthetic owner");
    const owner = auth.data.user.id;
    await page.goto(`/${locale}/app/settings/data`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      locale === "es" ? "Tus datos en Lexora" : "Your data in Lexora",
    );
    await assertStudyLayout(page, info, `data-information-${locale}`);
    const staleContext = await browser.newContext({
      storageState: await page.context().storageState(),
    });
    try {
      await page.goto(`/${locale}/app/settings`);
      const downloadPromise = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: locale === "es" ? "Descargar JSON" : "Download JSON",
          exact: true,
        })
        .click();
      const download = await downloadPromise,
        path = await download.path();
      if (!path) throw new Error("Backup before destructive fixture test required");
      const text = (await readFile(path)).toString("utf8"),
        backup = JSON.parse(text);
      expect(backup.payload.profiles[0].id).toBe(owner);
      const raw = text.slice(text.indexOf(',"payload":') + ',"payload":'.length, -1);
      expect(createHash("sha256").update(raw).digest("hex")).toBe(backup.payloadSha256);
      const section = page.getByRole("region", {
        name: locale === "es" ? "Eliminar tu cuenta" : "Delete your account",
        exact: true,
      });
      await section.locator("summary").click();
      await assertStudyLayout(page, info, `account-deletion-${locale}`);
      await section
        .getByLabel(
          locale === "es" ? "Confirma el correo de tu cuenta" : "Confirm your account email",
        )
        .fill(email);
      const password = section.getByLabel(
          locale === "es" ? "Tu contraseña actual" : "Your current password",
        ),
        confirmation = section.getByLabel(
          locale === "es" ? "Escribe DELETE para confirmar" : "Type DELETE to confirm",
        );
      await password.fill("wrong-password-123");
      await confirmation.fill("DELETE");
      await section.getByRole("checkbox").check();
      await section
        .getByRole("button", {
          name:
            locale === "es"
              ? "Eliminar mi cuenta permanentemente"
              : "Permanently delete my account",
          exact: true,
        })
        .click();
      await expect(section.getByRole("alert")).toContainText(
        locale === "es" ? "verificar" : "verified",
      );
      await expect(password).toHaveValue("");
      expect((await client.auth.getUser()).data.user?.id).toBe(owner);
      await password.fill(PASSWORD);
      const deleting = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/account/delete") && response.request().method() === "POST",
      );
      await section
        .getByRole("button", {
          name:
            locale === "es"
              ? "Eliminar mi cuenta permanentemente"
              : "Permanently delete my account",
          exact: true,
        })
        .click();
      const deletedResponse = await deleting;
      expect(deletedResponse.status()).toBe(200);
      await expect(page).toHaveURL(`/${locale}/login?deleted=1`);
      await expect(page.getByRole("status")).toContainText(
        locale === "es" ? "eliminado" : "deleted",
      );
      const stale = await staleContext.newPage();
      await stale.goto(`/${locale}/app`);
      await expect(stale).toHaveURL(new RegExp(`/${locale}/login`));
      expect((await client.auth.getUser()).error).not.toBeNull();
      await page.getByLabel(locale === "es" ? "Correo" : "Email").fill(email);
      await page
        .getByLabel(locale === "es" ? "Contraseña" : "Password", { exact: true })
        .fill(PASSWORD);
      await page
        .getByRole("button", { name: locale === "es" ? "Entrar" : "Sign in", exact: true })
        .click();
      await expect(page.getByRole("alert")).toBeVisible();
      expect(
        (await client.auth.signInWithPassword({ email, password: PASSWORD })).error,
      ).not.toBeNull();
    } finally {
      await staleContext.close();
      await client.auth.signOut();
    }
  });
