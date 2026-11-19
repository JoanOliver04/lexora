import { randomUUID } from "node:crypto";
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
      const dock = page.locator(".workspace-bottom-nav");
      if (await dock.isVisible()) {
        const content = await page.locator("#workspace-content").boundingBox();
        const navigation = await dock.boundingBox();
        expect(navigation!.y).toBeGreaterThanOrEqual(content!.y + content!.height - 1);
      }
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

test("the selected deck and mode survive an unrelated unfinished import", async ({ page }) => {
  const email = await signUp(page);
  await completeOnboarding(page);
  const fixture = await localLibraryFixture(email);
  const { client, courseId, ownerId, deckId, cleanup } = fixture;
  try {
    const destination = randomUUID();
    await checked(
      client.from("decks").insert({
        id: destination,
        owner_id: ownerId,
        course_id: courseId,
        title: "Chosen destination",
      }),
    );
    const job = randomUUID();
    await checked(
      client.rpc("begin_import_job", {
        p_id: job,
        p_course_id: courseId,
        p_deck_id: deckId,
        p_filename: "pending-sample.tsv",
        p_file_hash: "1".repeat(64),
        p_total_rows: 1,
        p_mapping: {
          front: 0,
          back: 1,
          tags: null,
          strategy: "skip",
          createReverse: false,
          originalBytes: 50,
          deckMode: "append",
        },
      }),
    );

    await page.goto(`/es/import?deck=${deckId}&mode=replace`);
    await expect(
      page.getByRole("heading", { name: "Hay una importación pendiente en este curso" }),
    ).toBeVisible();
    await page.goto(`/es/import?deck=${destination}&mode=replace`);
    await expect(
      page.getByText("Reemplazar el contenido de Chosen destination", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Archivo", { exact: true })).toHaveCount(0);
    const pending = page.getByRole("link", { name: "Abrir importación pendiente" });
    await expect(pending).toHaveAttribute("href", `/es/import?job=${job}`);
    await pending.click();
    await expect(page.getByText("pending-sample.tsv", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Finalizar este intento" }).click();
    await expect(page.getByRole("button", { name: "Importar otro archivo" })).toBeVisible();
    await page.goto(`/es/import?deck=${destination}&mode=replace`);
    await expect(
      page.getByText("Reemplazar el contenido de Chosen destination", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Archivo", { exact: true })).toBeVisible();
    const before = await checked(
      client.from("deck_concepts").select("concept_id").eq("deck_id", deckId),
    );
    expect(before).toEqual([{ concept_id: fixture.conceptId }]);
  } finally {
    await cleanup();
  }
});
