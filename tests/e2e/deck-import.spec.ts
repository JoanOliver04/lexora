import { expect, test } from "@playwright/test";
import { completeOnboarding, signUp } from "./helpers";
import { checked, localLibraryFixture } from "./local-library-fixture";

for (const mode of ["append", "replace"] as const) {
  test(`deck import ${mode} preserves the intended destination and skips duplicates`, async ({
    page,
  }) => {
    const replace = mode === "replace";
    const email = await signUp(page);
    await completeOnboarding(page);
    const fixture = await localLibraryFixture(email);
    const { client, deckId, conceptId, cleanup } = fixture;
    try {
      await page.goto(`/es/decks/${deckId}`);
      const options = page.getByRole("region", { name: "Importar contenido" });
      await expect(options.getByRole("link", { name: "Añadir", exact: true })).toBeVisible();
      await expect(options.getByRole("link", { name: "Reemplazar", exact: true })).toBeVisible();
      await options
        .getByRole("link", { name: replace ? "Reemplazar" : "Añadir", exact: true })
        .click();
      await expect(
        page.getByText(
          replace
            ? "Reemplazar el contenido de Acceptance deck"
            : "Añadir contenido a Acceptance deck",
          { exact: true },
        ),
      ).toBeVisible();
      await page.getByLabel("Archivo", { exact: true }).setInputFiles({
        name: "synthetic-topic.tsv",
        mimeType: "text/tab-separated-values",
        buffer: Buffer.from(
          [
            "  acceptance  CONCEPT\tNew meaning",
            "New synthetic term\tFirst meaning",
            "new SYNTHETIC term\tDuplicate meaning",
          ].join("\n"),
          "utf8",
        ),
      });
      await page.getByRole("button", { name: "Previsualizar", exact: true }).click();
      await expect(
        page.getByText(replace ? "1 posible duplicada" : "2 posibles duplicadas"),
      ).toBeVisible();
      const next = page.getByRole("button", { name: "Continuar", exact: true });
      await next.click();
      await expect(page.getByRole("heading", { name: "Mazo e inversa" })).toBeVisible();
      await expect(
        page.getByRole("paragraph").filter({ hasText: /^Mazo: Acceptance deck$/ }),
      ).toBeVisible();
      await next.click();
      await expect(page.getByRole("heading", { name: "Duplicados", exact: true })).toBeVisible();
      await expect(page.getByRole("radio")).toHaveCount(0);
      await next.click();
      await expect(page.getByRole("heading", { name: "Confirmar importación" })).toBeVisible();
      const submit = page.getByRole("button", {
        name: replace ? "Reemplazar contenido" : "Añadir al mazo",
        exact: true,
      });
      if (replace) {
        await expect(submit).toBeDisabled();
        const current = await checked(
          client.from("deck_concepts").select("concept_id").eq("deck_id", deckId),
        );
        expect(current).toEqual([{ concept_id: conceptId }]);
        await page
          .getByRole("checkbox", { name: "Quiero reemplazar el contenido de Acceptance deck" })
          .check();
      }
      await submit.click();
      await expect(page.getByRole("heading", { name: "Importación terminada" })).toBeVisible();
      await expect(page.getByText(`Creadas: ${replace ? 2 : 1}`, { exact: true })).toBeVisible();
      await expect(page.getByText(`Omitidas: ${replace ? 1 : 2}`, { exact: true })).toBeVisible();
      const links = await checked(
        client
          .from("deck_concepts")
          .select("concept_id, concepts!inner(canonical_key,summary)")
          .eq("deck_id", deckId)
          .order("position"),
      );
      expect(links?.map((entry) => entry.concepts)).toEqual([
        {
          canonical_key: "acceptance concept",
          summary: replace ? "New meaning" : "Original synthetic learning content",
        },
        { canonical_key: "new synthetic term", summary: "First meaning" },
      ]);
      expect(links?.some((entry) => entry.concept_id === conceptId)).toBe(!replace);
      const original = await checked(
        client.from("concepts").select("id").eq("id", conceptId).single(),
      );
      expect(original?.id).toBe(conceptId);
    } finally {
      await cleanup();
    }
  });
}
