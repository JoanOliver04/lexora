import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { completeOnboarding, signUp } from "./helpers";
import { checked, localLibraryFixture } from "./local-library-fixture";

for (const locale of ["es", "en"] as const) {
  test(`return from a card to the same deck and filtered results (${locale})`, async ({ page }) => {
    test.setTimeout(60000);
    const text = locale === "es" ? es : en;
    const email = await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    const { client, ownerId, courseId, deckId, conceptId, cleanup } =
      await localLibraryFixture(email);
    try {
      const scope = { owner_id: ownerId, course_id: courseId };
      const filters = { category: "grammar" as const, cefr_level: "B1" as const };
      const siblings = Array.from({ length: 20 }, (_, position) => ({
        id: randomUUID(),
        position,
        title: `Acceptance ${position}`,
      }));
      await checked(
        client
          .from("decks")
          .update({ ...filters, position: 20 })
          .eq("id", deckId),
      );
      await checked(
        client
          .from("decks")
          .insert(
            siblings.map(({ position, title }) => ({ ...scope, ...filters, position, title })),
          ),
      );
      await checked(
        client.from("concepts").insert(
          siblings.map(({ id, title }) => ({
            ...scope,
            id,
            title,
            kind: "vocabulary" as const,
            summary: "Synthetic meaning",
          })),
        ),
      );
      await checked(
        client
          .from("deck_concepts")
          .update({ position: 20 })
          .eq("deck_id", deckId)
          .eq("concept_id", conceptId),
      );
      await checked(
        client.from("deck_concepts").insert(
          siblings.map(({ id, position }) => ({
            owner_id: ownerId,
            deck_id: deckId,
            concept_id: id,
            position,
          })),
        ),
      );

      const filtersQuery = "q=Acceptance&category=grammar&cefrLevel=B1&archived=1&page=2";
      const listPath = `/${locale}/decks?${filtersQuery}`;
      const deckPath = `/${locale}/decks/${deckId}?${filtersQuery}`;
      await page.goto(listPath);
      const row = page
        .getByRole("listitem")
        .filter({ has: page.getByRole("link", { name: "Acceptance deck", exact: true }) });
      await row.getByRole("link", { name: /^21 / }).click();
      await expect(page).toHaveURL(`${deckPath}#deck-concepts`);
      const search = page.getByRole("form", { name: text.Library.memberSearchLabel });
      await search.getByRole("searchbox").fill("Acceptance");
      await search.getByRole("button", { name: text.Library.detailSearchSubmit }).click();
      await expect(page).toHaveURL(
        (url) => url.searchParams.get("members") === "Acceptance" && url.hash === "#deck-concepts",
      );
      await page
        .getByRole("navigation", { name: text.Library.membersPaginationLabel })
        .getByRole("link", { name: text.Library.pagination.next })
        .click();
      await expect(page).toHaveURL(
        (url) => url.searchParams.get("memberPage") === "2" && url.hash === "#deck-concepts",
      );
      const member = page.getByRole("link", { name: "Acceptance concept", exact: true });
      await member.click();
      await page.getByRole("link", { name: text.Concepts.items.actions.edit, exact: true }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: text.Concepts.items.editHeading }),
      ).toBeVisible();
      await page.locator("#item-promptText").fill("Edited question");
      await page
        .getByRole("button", { name: text.Concepts.items.actions.save, exact: true })
        .click();
      await expect(
        page.getByText("Edited question → An original answer", { exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: text.Concepts.backToDeck, exact: true }).click();
      const deckContents = `${deckPath}&members=Acceptance&memberPage=2#deck-concepts`;
      await expect(page).toHaveURL(deckContents);
      await expect(member).toBeVisible();
      await member.click();
      await expect(
        page.getByRole("heading", { level: 1, name: text.Concepts.editHeading }),
      ).toBeVisible();
      await page
        .getByRole("group", { name: text.Concepts.actions.save })
        .getByRole("button", { name: text.Concepts.actions.save })
        .click();
      await expect(page).toHaveURL(deckContents);
      await page.getByRole("link", { name: text.Library.detailBack, exact: true }).click();
      await expect(page).toHaveURL(listPath);

      await row.getByRole("link", { name: "Acceptance deck", exact: true }).click();
      await page
        .getByRole("group", { name: text.Library.actions.save })
        .getByRole("button", { name: text.Library.actions.save })
        .click();
      await expect(page).toHaveURL(listPath);
      await row.getByRole("button", { name: text.Library.actions.archive }).click();
      await expect(row.getByText(text.Library.archivedBadge, { exact: true })).toBeVisible();
      await expect(page).toHaveURL(listPath);
      await row.getByRole("button", { name: text.Library.actions.restore }).click();
      await expect(row.getByRole("button", { name: text.Library.actions.archive })).toBeVisible();
      await expect(page).toHaveURL(listPath);
    } finally {
      await cleanup();
    }
  });
}
