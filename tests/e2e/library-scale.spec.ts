import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, PASSWORD, signUp, uniqueEmail } from "./helpers";

async function checked(query: PromiseLike<{ error: unknown }>) {
  if ((await query).error) throw new Error("Synthetic library fixture operation failed");
}
for (const locale of ["es", "en"] as const)
  test(`large deck counts, both page selectors and mutation context (${locale})`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    const email = await signUp(page, { email: uniqueEmail("e2e-library-scale") });
    await completeOnboarding(page, { uiLocale: locale });
    if (!process.env["NEXT_PUBLIC_SUPABASE_URL"]) process.loadEnvFile(".env.local");
    const url = process.env["NEXT_PUBLIC_SUPABASE_URL"]!,
      target = new URL(url);
    if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "54321")
      throw new Error("Local synthetic fixtures only");
    const client = createClient<Database>(
      url,
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    );
    const { data: auth, error } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD,
    });
    if (error || !auth.user) throw new Error("Synthetic fixture session missing");
    const owner = auth.user.id;
    const { data: course } = await client
      .from("courses")
      .select("id")
      .eq("owner_id", owner)
      .single();
    if (!course) throw new Error("Synthetic course missing");
    const deck = randomUUID(),
      ids = Array.from({ length: 2020 }, () => randomUUID());
    const remove = locale === "es" ? "Quitar del mazo" : "Remove from deck";
    const memberLabel = locale === "es" ? "Buscar dentro del mazo" : "Search within this deck";
    const availableLabel =
      locale === "es" ? "Buscar conceptos para añadir" : "Search concepts to add";
    const submit = locale === "es" ? "Buscar" : "Search";
    const memberNavigation =
      locale === "es" ? "Páginas de conceptos del mazo" : "Deck concept pages";
    try {
      await checked(
        client.from("decks").insert({
          id: deck,
          owner_id: owner,
          course_id: course.id,
          title: "Synthetic large library",
        }),
      );
      for (let start = 0; start < ids.length; start += 500)
        await checked(
          client.from("concepts").insert(
            ids.slice(start, start + 500).map((id, index) => ({
              id,
              owner_id: owner,
              course_id: course.id,
              kind: "vocabulary" as const,
              title: `Synthetic library ${String(start + index).padStart(5, "0")}`,
              summary: "Synthetic meaning",
            })),
          ),
        );
      for (let start = 0; start < 1010; start += 500)
        await checked(
          client.from("deck_concepts").insert(
            ids.slice(start, Math.min(start + 500, 1010)).map((id, index) => ({
              owner_id: owner,
              deck_id: deck,
              concept_id: id,
              position: start + index,
            })),
          ),
        );
      await page.goto(`/${locale}/decks`);
      const card = page
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Synthetic large library", exact: true }) });
      await expect(card).toContainText(/1[.,]?010/);
      await page.getByRole("link", { name: "Synthetic large library", exact: true }).click();
      await expect(page.getByRole("button", { name: remove, exact: true })).toHaveCount(20);
      await expect(page.locator("#link-concept option")).toHaveCount(20);
      await page
        .getByRole("navigation", { name: memberNavigation, exact: true })
        .getByRole("link", { name: locale === "es" ? "Siguiente" : "Next", exact: true })
        .click();
      await expect(page).toHaveURL(/memberPage=2/);
      await expect(page.getByText("Synthetic library 00020", { exact: true })).toBeVisible();
      await page.getByRole("searchbox", { name: memberLabel, exact: true }).fill("01009");
      await page
        .getByRole("form", { name: memberLabel, exact: true })
        .getByRole("button", { name: submit, exact: true })
        .click();
      await expect(page.getByRole("button", { name: remove, exact: true })).toHaveCount(1);
      await expect(page.getByText("Synthetic library 01009", { exact: true })).toBeVisible();
      await page.getByRole("searchbox", { name: availableLabel, exact: true }).fill("02019");
      await page
        .getByRole("form", { name: availableLabel, exact: true })
        .getByRole("button", { name: submit, exact: true })
        .click();
      await expect(page.locator("#link-concept option")).toHaveCount(1);
      await page
        .getByLabel(locale === "es" ? "Concepto" : "Concept", { exact: true })
        .selectOption({ label: "Synthetic library 02019" });
      await page
        .getByRole("button", {
          name: locale === "es" ? "Añadir al mazo" : "Add to deck",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/members=01009.*available=02019/);
      await page.getByRole("searchbox", { name: memberLabel, exact: true }).fill("02019");
      await page
        .getByRole("form", { name: memberLabel, exact: true })
        .getByRole("button", { name: submit, exact: true })
        .click();
      await expect(page.getByRole("button", { name: remove, exact: true })).toHaveCount(1);
      await page.getByRole("button", { name: remove, exact: true }).click();
      await expect(page).toHaveURL(/members=02019.*available=02019/);
      await expect(page.getByRole("button", { name: remove, exact: true })).toHaveCount(0);
      await expect(page.locator("#link-concept option")).toHaveCount(1);
      await page.goto(`/${locale}/decks/${deck}?memberPage=99999999&availablePage=99999999`);
      await expect(page.getByRole("button", { name: remove, exact: true })).toHaveCount(10);
      await expect(page.locator("#link-concept option")).toHaveCount(10);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const response = await page.goto(
        `/${locale}/decks/${deck}?members=a&members=b&availablePage=NaN`,
      );
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("button", { name: remove, exact: true })).toHaveCount(20);
    } finally {
      await checked(client.from("courses").delete().eq("owner_id", owner).eq("id", course.id));
      await client.auth.signOut();
    }
  });
