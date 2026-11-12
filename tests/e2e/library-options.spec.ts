import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "../../src/shared/infrastructure/supabase/database.types";
import { completeOnboarding, signUp, uniqueEmail, PASSWORD } from "./helpers";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import { localBackend } from "./local-backend";

async function checked(query: PromiseLike<{ error: unknown }>) {
  if ((await query).error) throw Error("Synthetic options fixture failed");
}
for (const locale of ["es", "en"] as const)
  test(`large concept options and destination picker preserve context (${locale})`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const text = locale === "es" ? es : en;
    const email = await signUp(page, { email: uniqueEmail("e2e-library-options") });
    await completeOnboarding(page, { uiLocale: locale });
    const { url, publishableKey } = localBackend();
    const client = createClient<Database>(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auth = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (!auth.data.user) throw Error("Synthetic session unavailable");
    const owner = auth.data.user.id;
    const course = await client.from("courses").select("id").eq("owner_id", owner).single();
    if (!course.data) throw Error("Synthetic course unavailable");
    const courseId = course.data.id,
      concept = randomUUID();
    const tags = Array.from({ length: 1010 }, () => randomUUID());
    try {
      await checked(
        client.from("concepts").insert({
          id: concept,
          owner_id: owner,
          course_id: courseId,
          title: "Synthetic option concept",
          summary: "Synthetic meaning",
          kind: "vocabulary",
        }),
      );
      for (let start = 0; start < 1010; start += 500) {
        const batch = tags.slice(start, start + 500);
        await checked(
          client.from("tags").insert(
            batch.map((id, i) => ({
              id,
              owner_id: owner,
              course_id: courseId,
              display_name: `Options_${String(start + i).padStart(5, "0")}`,
              normalized_name: `options_${String(start + i).padStart(5, "0")}`,
            })),
          ),
        );
        await checked(
          client
            .from("concept_tags")
            .insert(batch.map((id) => ({ owner_id: owner, concept_id: concept, tag_id: id }))),
        );
        await checked(
          client.from("practice_items").insert(
            batch.map((_, i) => ({
              owner_id: owner,
              concept_id: concept,
              mode: "basic_recognition" as const,
              prompt_text: `Prompt ${String(start + i).padStart(5, "0")}`,
              answer_text: "Meaning",
              config: { mode: "basic_recognition" },
              created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, start + i)).toISOString(),
            })),
          ),
        );
        await checked(
          client.from("decks").insert(
            batch.map((_, i) => ({
              owner_id: owner,
              course_id: courseId,
              title: `Options deck ${String(start + i).padStart(5, "0")}`,
              position: start + i,
            })),
          ),
        );
      }
      await page.goto(`/${locale}/concepts`);
      const card = page
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Synthetic option concept", exact: true }) });
      await expect(card.getByText("Options_00000", { exact: true })).toBeVisible();
      await expect(card.getByText("Options_00003", { exact: true })).toHaveCount(0);
      await expect(
        card.getByRole("link", {
          name: locale === "es" ? "+1007 etiquetas más" : "+1007 more tags",
          exact: true,
        }),
      ).toBeVisible();
      await page.goto(`/${locale}/concepts/${concept}?tagPage=51&itemPage=51`);
      await expect(
        page.getByRole("button", {
          name: `${text.Concepts.tags.removeButton}: Options_01009`,
          exact: true,
        }),
      ).toBeVisible();
      const item = page
        .getByRole("listitem")
        .filter({ has: page.getByText("Prompt 01009 → Meaning", { exact: true }) });
      await item.getByRole("link", { name: text.Concepts.items.actions.edit, exact: true }).click();
      await expect(page.locator("#item-promptText")).toHaveValue("Prompt 01009");
      await page
        .getByRole("link", { name: text.Concepts.items.backToConcept, exact: true })
        .click();
      await expect(page).toHaveURL(/tagPage=51&itemPage=51/);
      await page
        .getByRole("button", {
          name: `${text.Concepts.tags.removeButton}: Options_01009`,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(/tagPage=51&itemPage=51/);
      await expect(
        page.getByRole("button", {
          name: `${text.Concepts.tags.removeButton}: Options_01009`,
          exact: true,
        }),
      ).toHaveCount(0);
      await page
        .getByRole("listitem")
        .filter({ has: page.getByText("Prompt 01009 → Meaning", { exact: true }) })
        .getByRole("button", { name: text.Concepts.items.actions.reverse, exact: true })
        .click();
      await expect(page.getByRole("status")).toHaveText(text.Concepts.optionsSaved);
      await expect(page.getByText("Meaning → Prompt 01009", { exact: true })).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
      await page.goto(`/${locale}/import`);
      await page.getByLabel(text.Import.fileLabel, { exact: true }).setInputFiles({
        name: "synthetic-directive.tsv",
        mimeType: "text/plain",
        buffer: Buffer.from("#tags column:1\ntag\tImported front\tImported back"),
      });
      await page.getByRole("button", { name: text.Import.submit, exact: true }).click();
      await expect(page.locator("tbody tr").first().locator("td").nth(1)).toHaveText(
        "Imported front",
      );
      await expect(page.locator("tbody tr").first().locator("td").nth(2)).toHaveText(
        "Imported back",
      );
      await page.getByRole("button", { name: text.Import.wizard.continue, exact: true }).click();
      await expect(page.locator("#import-deck option")).toHaveCount(20);
      const first = await page.locator("#import-deck").inputValue();
      await page
        .getByRole("searchbox", { name: text.Import.deckSearch, exact: true })
        .fill("Options deck 01009");
      await page.getByRole("button", { name: text.Import.deckSearchSubmit, exact: true }).click();
      await expect(page.locator("#import-deck option")).toHaveCount(2);
      await expect(page.locator("#import-deck")).toHaveValue(first);
      await page.locator("#import-deck").selectOption({ label: "Options deck 01009" });
      for (let i = 0; i < 2; i++)
        await page.getByRole("button", { name: text.Import.wizard.continue, exact: true }).click();
      await expect(
        page.getByText(text.Import.wizard.recapDeck.replace("{deck}", "Options deck 01009"), {
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole("button", { name: text.Import.execute.submit, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: text.Import.result.heading, exact: true }),
      ).toBeVisible();
      const imported = await client
        .from("concepts")
        .select("id")
        .eq("owner_id", owner)
        .eq("title", "Imported front")
        .single();
      expect(imported.data).not.toBeNull();
      expect(
        (
          await client
            .from("deck_concepts")
            .select("concept_id")
            .eq("concept_id", imported.data!.id)
        ).data,
      ).toHaveLength(1);
    } finally {
      await checked(client.from("courses").delete().eq("id", courseId).eq("owner_id", owner));
      await client.auth.signOut();
    }
  });
