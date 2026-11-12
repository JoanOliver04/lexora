import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp } from "./helpers";
import { assertStudyLayout } from "./study-layout";
import { localBackend } from "./local-backend";

async function checked<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>) {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}
for (const locale of ["es", "en"] as const) {
  test(`preferences persist, detect stale tabs and affect study (${locale})`, async ({
    page,
    context,
    browser,
  }, info) => {
    test.setTimeout(90000);
    const email = await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    const { url, publishableKey } = localBackend();
    const client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: auth, error: authError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (authError) throw authError;
    const owner = auth.user.id;
    const original = await checked(
      client
        .from("courses")
        .select("id,source_language_id,target_language_id")
        .eq("owner_id", owner)
        .single(),
    );
    const course = original!.id,
      second = randomUUID(),
      deck = randomUUID(),
      concept = randomUUID();
    let remote: Awaited<ReturnType<typeof browser.newContext>> | undefined;
    const stale = await context.newPage();
    try {
      await checked(
        client.from("courses").insert({
          id: second,
          owner_id: owner,
          title: "Second original course",
          source_language_id: original!.source_language_id,
          target_language_id: original!.target_language_id,
        }),
      );
      await checked(
        client
          .from("course_settings")
          .insert({ course_id: second, user_id: owner, daily_new_limit: 17 }),
      );
      await checked(
        client
          .from("decks")
          .insert({ id: deck, owner_id: owner, course_id: course, title: "Preferences fixture" }),
      );
      await checked(
        client.from("concepts").insert({
          id: concept,
          owner_id: owner,
          course_id: course,
          kind: "vocabulary",
          title: "Original fixture",
          summary: "Original",
        }),
      );
      await checked(
        client
          .from("deck_concepts")
          .insert({ owner_id: owner, deck_id: deck, concept_id: concept }),
      );
      await checked(
        client.from("practice_items").insert(
          [0, 1].map(() => ({
            owner_id: owner,
            concept_id: concept,
            mode: "basic_recall" as const,
            prompt_text: "Original prompt",
            answer_text: "Original answer",
            config: { mode: "basic_recall" },
          })),
        ),
      );
      await page.goto(`/${locale}/app/settings`);
      await stale.goto(`/${locale}/app/settings`);
      const save = locale === "es" ? "Guardar preferencias" : "Save preferences";
      await page.locator("#dailyNewLimit").fill("101");
      await page.getByRole("button", { name: save, exact: true }).click();
      await expect(page.locator("#dailyNewLimit")).toHaveAttribute("aria-invalid", "true");
      await expect(page.locator("#dailyNewLimit")).toBeFocused();
      await page.locator("#dailyNewLimit").fill("0");
      await page.locator("#maximumReviews").fill("0");
      await page.locator("#theme").selectOption("dark");
      await page.locator("#timeZone").fill("America/New_York");
      await page.locator('[name="showIntervals"]').uncheck();
      await page.getByRole("button", { name: save, exact: true }).click();
      await expect(page.getByRole("status")).toContainText(
        locale === "es" ? "Preferencias guardadas" : "Preferences saved",
      );
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      await stale.locator("#dailyNewLimit").fill("9");
      await stale.getByRole("button", { name: save, exact: true }).click();
      await expect(stale.getByRole("main").getByRole("alert")).toContainText(
        locale === "es" ? "otra pestaña" : "another tab",
      );
      await stale
        .getByRole("button", {
          name: locale === "es" ? "Cargar ajustes actuales" : "Load current settings",
        })
        .click();
      await expect(stale.locator("#dailyNewLimit")).toHaveValue("0");
      await expect(stale.getByRole("main").getByRole("alert")).toHaveCount(0);
      await page.goto(`/${locale}/app`);
      await expect(
        page.getByText(
          locale === "es"
            ? "ítems nuevos quedan fuera del cupo"
            : "new items are outside today's allowance",
          {
            exact: false,
          },
        ),
      ).toBeVisible();
      await page.goto(`/${locale}/app/settings`);
      await page.locator("#dailyNewLimit").fill("2");
      await page.locator("#maximumReviews").fill("");
      await page.getByRole("button", { name: save, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${locale}/app/settings\\?saved=1$`));
      // A fresh browser context has cookies but no copied appearance storage.
      const state = await context.storageState();
      remote = await browser.newContext({ storageState: { cookies: state.cookies, origins: [] } });
      const other = await remote.newPage();
      await other.goto(`/${locale}/app/settings`);
      await expect(other.locator("#theme")).toHaveValue("dark");
      await expect(other.locator("html")).toHaveAttribute("data-theme", "dark");
      await expect(other.locator("#timeZone")).toHaveValue("America/New_York");
      await expect(other.locator("#maximumReviews")).toHaveValue("");
      await expect(other.locator('[name="showIntervals"]')).not.toBeChecked();
      await page.goto(`/${locale}/app/study?deck=${deck}`);
      await page
        .getByRole("button", { name: locale === "es" ? "Crear sesión" : "Create session" })
        .click();
      await page
        .getByRole("button", { name: locale === "es" ? "Revelar respuesta" : "Reveal answer" })
        .click();
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      await expect(page.getByTestId("interval-good")).toHaveCount(0);
      await page.goto(`/${locale}/app/settings`);
      await page.locator("#courseId").selectOption(second);
      await page
        .getByRole("button", {
          name: locale === "es" ? "Cambiar de curso" : "Switch course",
          exact: true,
        })
        .click();
      await expect(page.locator("#dailyNewLimit")).toHaveValue("17");
      const target = locale === "es" ? "en" : "es";
      await page.locator("#uiLocale").selectOption(target);
      await page.getByRole("button", { name: save, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/${target}/app/settings\\?saved=1$`));
      await expect(
        page.getByRole("heading", { name: target === "es" ? "Ajustes" : "Settings", exact: true }),
      ).toBeVisible();
      await assertStudyLayout(page, info, `settings-${target}`);
      await page.screenshot({ path: info.outputPath(`settings-${target}.png`), fullPage: true });
    } finally {
      await remote?.close();
      await stale.close();
      await checked(
        client.from("courses").delete().eq("owner_id", owner).in("id", [course, second]),
      );
      await client.auth.signOut();
    }
  });
}
