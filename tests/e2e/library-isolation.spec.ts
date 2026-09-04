import { expect, test } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * Aislamiento A/B de la biblioteca en la capa de interfaz (LEX-3.12, cierre
 * de M3).
 *
 * RLS ya está probado en `090-library-rls.sql` (48 aserciones: A ve solo lo
 * suyo, no alcanza lo de B ni por UUID conocido, `INSERT`/`UPDATE`/`DELETE`
 * ajenos fallan o no tocan filas) y el servidor toma el `userId` de
 * `getClaims()`, nunca de un parámetro (`getLibraryContextForCurrentUser`).
 * Ningún E2E de LEX-3.5…3.11 había abierto **dos** navegadores a la vez sobre
 * mazos/conceptos — es el mismo hueco que `isolation.spec.ts` (LEX-2.11)
 * cerró para identidad/curso, aquí para biblioteca.
 */
test("dos usuarios con sesión simultánea no acceden a los mazos ni conceptos del otro", async ({
  browser,
}) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signUp(pageA);
    await completeOnboarding(pageA);
    await pageA.goto("/es/decks");
    await pageA.getByLabel("Nombre", { exact: true }).fill("Mazo de A");
    await pageA.getByRole("button", { name: "Crear mazo" }).click();
    await expect(pageA.getByRole("link", { name: "Mazo de A", exact: true })).toBeVisible();
    await pageA.getByRole("link", { name: "Mazo de A", exact: true }).click();
    await expect(pageA).toHaveURL(/\/es\/decks\/[0-9a-f-]+$/);
    const deckIdOfA = pageA.url().split("/").pop();

    await pageA.goto("/es/concepts");
    await pageA.getByLabel("Título", { exact: true }).fill("Concepto de A");
    await pageA.getByLabel("Resumen", { exact: true }).fill("Resumen de A");
    await pageA.getByRole("button", { name: "Crear concepto" }).click();
    await expect(pageA.getByRole("link", { name: "Concepto de A", exact: true })).toBeVisible();
    await pageA.getByRole("link", { name: "Concepto de A", exact: true }).click();
    await expect(pageA).toHaveURL(/\/es\/concepts\/[0-9a-f-]+$/);
    const conceptIdOfA = pageA.url().split("/").pop();

    await signUp(pageB);
    await completeOnboarding(pageB);

    // B no ve nada de A en sus propias listas: cuenta cero, no solo ausencia
    // de coincidencia (una biblioteca vacía y una filtrada se verían igual
    // por presencia; el conteo distingue "no está" de "no hay nada que ver").
    await pageB.goto("/es/decks");
    await expect(pageB.getByRole("link", { name: "Mazo de A", exact: true })).toHaveCount(0);
    await expect(pageB.getByText("Todavía no tienes mazos en este curso")).toBeVisible();

    await pageB.goto("/es/concepts");
    await expect(pageB.getByRole("link", { name: "Concepto de A", exact: true })).toHaveCount(0);
    await expect(pageB.getByText("Todavía no tienes conceptos en este curso")).toBeVisible();

    // Ni por UUID conocido, entrando directo por URL: RLS + `.eq("owner_id", …)`
    // hacen que la fila de A **no exista** para B (404), no que se le niegue
    // el paso (403). El estado HTTP es lo que distingue de verdad «invisible»
    // de «denegado» — el texto del 404 por defecto de Next.js no basta, un
    // 500 mal manejado también podría acabar mostrando una página parecida.
    const deckResponse = await pageB.goto(`/es/decks/${deckIdOfA}`);
    expect(deckResponse?.status()).toBe(404);
    await expect(pageB.getByText("This page could not be found.")).toBeVisible();

    const conceptResponse = await pageB.goto(`/es/concepts/${conceptIdOfA}`);
    expect(conceptResponse?.status()).toBe(404);
    await expect(pageB.getByText("This page could not be found.")).toBeVisible();

    // La actividad de B tampoco cambia lo que ve A.
    await pageB.goto("/es/decks");
    await pageB.getByLabel("Nombre", { exact: true }).fill("Mazo de B");
    await pageB.getByRole("button", { name: "Crear mazo" }).click();
    await expect(pageB.getByRole("link", { name: "Mazo de B", exact: true })).toBeVisible();

    await pageA.goto("/es/decks");
    await expect(pageA.getByRole("link", { name: "Mazo de A", exact: true })).toBeVisible();
    await expect(pageA.getByRole("link", { name: "Mazo de B", exact: true })).toHaveCount(0);
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
