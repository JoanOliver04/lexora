import { expect, test } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * CRUD y archivado de mazos (LEX-3.5).
 *
 * Un usuario con curso crea un mazo, lo renombra desde el detalle, lo archiva y
 * lo ve salir de la lista por defecto; con `?archived=1` vuelve a aparecer con
 * su distintivo. El aislamiento A/B ya lo cubre pgTAP `090`, no se repite aquí.
 */
test.describe("mazos", () => {
  test("crear, renombrar y archivar un mazo", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);

    // Se llega a los mazos desde el shell, como haría una persona.
    await page.getByRole("link", { name: "Mis mazos" }).click();
    await expect(page).toHaveURL("/es/decks");
    await expect(page.getByRole("heading", { name: "Mazos", level: 1 })).toBeVisible();
    await expect(page.getByText("Todavía no tienes mazos en este curso")).toBeVisible();

    // Crear.
    await page.getByLabel("Nombre").fill("Phrasal verbs");
    await page.getByRole("button", { name: "Crear mazo" }).click();
    await expect(page).toHaveURL("/es/decks");
    await expect(page.getByRole("link", { name: "Phrasal verbs" })).toBeVisible();
    await expect(page.getByText("Sin conceptos")).toBeVisible();

    // Renombrar desde el detalle.
    await page.getByRole("link", { name: "Phrasal verbs" }).click();
    await expect(page).toHaveURL(/\/es\/decks\/[0-9a-f-]+$/);
    await page.getByLabel("Nombre").fill("Phrasal verbs B1");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page).toHaveURL("/es/decks");
    await expect(page.getByRole("link", { name: "Phrasal verbs B1" })).toBeVisible();

    // Archivar: sale de la lista por defecto.
    await page.getByRole("button", { name: "Archivar" }).click();
    await expect(page).toHaveURL("/es/decks");
    await expect(page.getByRole("link", { name: "Phrasal verbs B1" })).toHaveCount(0);
    await expect(page.getByText("Todavía no tienes mazos en este curso")).toBeVisible();

    // Con archivados visibles vuelve a aparecer, marcado.
    await page.getByRole("link", { name: "Ver archivados" }).click();
    await expect(page).toHaveURL("/es/decks?archived=1");
    await expect(page.getByRole("link", { name: "Phrasal verbs B1" })).toBeVisible();
    await expect(page.getByText("Archivado", { exact: true })).toBeVisible();
  });

  test("un mazo nuevo se añade al final y se puede reordenar", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/decks");

    for (const name of ["Vocabulario", "Gramática"]) {
      await page.getByLabel("Nombre").fill(name);
      await page.getByRole("button", { name: "Crear mazo" }).click();
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }

    const titles = page.locator("main ul li a");
    await expect(titles).toHaveText(["Vocabulario", "Gramática"]);

    // "Bajar" en el primero intercambia el orden.
    await page
      .locator("li", { hasText: "Vocabulario" })
      .getByRole("button", { name: "Bajar" })
      .click();
    await expect(titles).toHaveText(["Gramática", "Vocabulario"]);
  });

  test("un mazo sin nombre no se crea y muestra el error", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);

    await page.goto("/es/decks");
    await page.getByRole("button", { name: "Crear mazo" }).click();

    await expect(page).toHaveURL("/es/decks");
    await expect(page.getByText("Escribe un nombre para el mazo.")).toBeVisible();
    await expect(page.getByLabel("Nombre")).toHaveAttribute("aria-invalid", "true");
  });
});
