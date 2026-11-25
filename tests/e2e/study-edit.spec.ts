import { expect, test } from "@playwright/test";
import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { completeOnboarding, signUp } from "./helpers";
import { checked, localLibraryFixture } from "./local-library-fixture";

for (const locale of ["es", "en"] as const) {
  test(`correct a revealed card and return to its live review (${locale})`, async ({ page }) => {
    const text = locale === "es" ? es : en;
    const email = await signUp(page);
    await completeOnboarding(page, { uiLocale: locale });
    const { client, deckId, itemId, conceptId, ownerId, cleanup } =
      await localLibraryFixture(email);
    try {
      await page.goto(`/${locale}/app/study?deck=${deckId}`);
      await page.getByRole("button", { name: text.StudySession.create, exact: true }).click();
      const card = page.getByTestId("study-card");
      const reveal = card.getByRole("button", { name: text.PracticeCard.reveal, exact: true });
      const edit = card.getByRole("button", { name: text.PracticeCard.editCard, exact: true });
      await expect(reveal).toBeVisible();
      const sessionUrl = page.url();
      const sessionId = new URL(sessionUrl).pathname.split("/").at(-1)!;
      const editorPath = `/${locale}/concepts/${conceptId}/items/${itemId}?fromStudy=${sessionId}`;
      await expect(edit).toHaveCount(0);
      await reveal.click();
      await edit.click();
      await expect(page).toHaveURL(editorPath);
      const field = page.getByLabel(text.Concepts.items.fields.answerLabel, { exact: true });
      await field.fill("Discard this draft");
      await page.getByRole("link", { name: text.Concepts.items.backToReview, exact: true }).click();
      await expect(page).toHaveURL(sessionUrl);
      await reveal.click();
      await expect(card.getByText("An original answer", { exact: true })).toBeVisible();
      await card
        .getByRole("heading", { name: text.PracticeCard.answerHeading, exact: true })
        .press("e");
      await expect(page).toHaveURL(editorPath);
      await field.fill("Corrected answer");
      await page
        .getByRole("button", { name: text.Concepts.items.actions.save, exact: true })
        .click();
      await expect(page).toHaveURL(sessionUrl);
      await reveal.click();
      await expect(card.getByText("Corrected answer", { exact: true })).toBeVisible();
      expect(
        await checked(client.from("review_logs").select("id").eq("owner_id", ownerId)),
      ).toEqual([]);
      expect(
        await checked(client.from("learning_states").select("id").eq("practice_item_id", itemId)),
      ).toEqual([]);

      if (locale === "es") {
        await card
          .getByRole("button", { name: text.PracticeCard.ratings.good.label, exact: true })
          .click();
        await expect(page.getByTestId("review-save-status")).toContainText(
          text.PracticeCard.ratings.good.label,
        );
        expect(
          await checked(
            client.from("review_logs").select("practice_item_id").eq("owner_id", ownerId),
          ),
        ).toEqual([{ practice_item_id: itemId }]);
      } else {
        await edit.click();
        await expect(page).toHaveURL(editorPath);
        await page
          .getByRole("button", { name: text.Concepts.items.actions.archive, exact: true })
          .click();
        await expect(page).toHaveURL(sessionUrl);
        await expect(page.getByTestId("session-available")).toContainText("0");
        await expect(card).toHaveCount(0);
        expect(
          await checked(client.from("review_logs").select("id").eq("owner_id", ownerId)),
        ).toEqual([]);
      }
    } finally {
      await cleanup();
    }
  });
}
