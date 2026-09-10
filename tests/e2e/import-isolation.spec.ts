import { expect, test } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * Aislamiento A/B del lote de importación en la interfaz (LEX-4.11, cierre
 * de M4).
 *
 * RLS de `import_jobs` ya está en pgTAP `110`; el de conceptos/mazos, en
 * `090`. `library-isolation.spec.ts` cubre el alta manual. El hueco era
 * el **otro** camino de escritura de FASE 4: A importa un TSV y B no debe
 * ver esos conceptos ni el mazo, ni por lista ni por UUID.
 */
test("lo que A importa no existe para B", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signUp(pageA);
    await completeOnboarding(pageA);
    await pageA.getByRole("link", { name: "Mis mazos" }).click();
    await pageA.getByLabel("Nombre").fill("Mazo importado de A");
    await pageA.getByRole("button", { name: "Crear mazo" }).click();
    await expect(pageA.getByRole("link", { name: "Mazo importado de A" })).toBeVisible();

    await pageA.goto("/es/import");
    await pageA.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await pageA.getByRole("button", { name: "Previsualizar" }).click();
    await pageA.getByRole("button", { name: "Continuar" }).click();
    await expect(pageA.getByRole("heading", { name: "Mazo e inversa", level: 2 })).toBeVisible();
    await pageA.getByRole("button", { name: "Continuar" }).click();
    await expect(pageA.getByRole("heading", { name: "Duplicados", level: 2 })).toBeVisible();
    await pageA.getByRole("button", { name: "Continuar" }).click();
    await pageA.getByRole("button", { name: "Importar al curso" }).click();
    await expect(pageA.getByRole("heading", { name: "Importación terminada" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(pageA.getByText("Creadas: 2")).toBeVisible();

    await pageA.goto("/es/concepts");
    await expect(pageA.getByRole("link", { name: "break the ice", exact: true })).toBeVisible();
    await pageA.getByRole("link", { name: "break the ice", exact: true }).click();
    await expect(pageA).toHaveURL(/\/es\/concepts\/[0-9a-f-]+$/);
    const conceptIdOfA = pageA.url().split("/").pop();

    await pageA.goto("/es/decks");
    await pageA.getByRole("link", { name: "Mazo importado de A", exact: true }).click();
    await expect(pageA).toHaveURL(/\/es\/decks\/[0-9a-f-]+$/);
    const deckIdOfA = pageA.url().split("/").pop();

    await signUp(pageB);
    await completeOnboarding(pageB);

    await pageB.goto("/es/concepts");
    await expect(pageB.getByRole("link", { name: "break the ice", exact: true })).toHaveCount(0);
    await expect(pageB.getByText("Todavía no tienes conceptos en este curso")).toBeVisible();

    await pageB.goto("/es/decks");
    await expect(pageB.getByRole("link", { name: "Mazo importado de A", exact: true })).toHaveCount(
      0,
    );

    const conceptResponse = await pageB.goto(`/es/concepts/${conceptIdOfA}`);
    expect(conceptResponse?.status()).toBe(404);
    await expect(pageB.getByText("This page could not be found.")).toBeVisible();

    const deckResponse = await pageB.goto(`/es/decks/${deckIdOfA}`);
    expect(deckResponse?.status()).toBe(404);
    await expect(pageB.getByText("This page could not be found.")).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
