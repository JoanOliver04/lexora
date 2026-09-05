import { expect, test } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * Vista previa y mapeo de columnas de importación (LEX-4.4, §9.7 pasos 1–4).
 *
 * Sube una fixture de `tests/fixtures/import/`, ve el separador detectado y la
 * muestra, cambia el mapeo de columnas y ve la muestra reflejarlo. No
 * persiste nada — no hay botón de confirmar todavía.
 */
test.describe("importación — vista previa", () => {
  test("subir un TSV, ver separador y muestra, y reasignar columnas", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);

    await page.getByRole("link", { name: "Importar", exact: true }).click();
    await expect(page).toHaveURL("/es/import");
    await expect(page.getByRole("heading", { name: "Importar", level: 1 })).toBeVisible();

    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();

    await expect(page.getByText("Separador detectado: tabulación")).toBeVisible();
    await expect(
      page.getByText("2 filas válidas · sin problemas (con el mapeo por defecto)"),
    ).toBeVisible();

    // Mapeo por defecto: frente = columna 1, reverso = columna 2.
    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText("break the ice");
    await expect(firstRow).toContainText("romper el hielo");

    // Intercambiar frente y reverso, sin volver a subir el archivo.
    await page.getByLabel("Columna de frente").selectOption("1");
    await page.getByLabel("Columna de reverso").selectOption("0");
    await page.getByRole("button", { name: "Actualizar vista previa" }).click();

    const firstRowAfter = page.locator("tbody tr").first();
    await expect(firstRowAfter.locator("td").nth(1)).toHaveText("romper el hielo");
    await expect(firstRowAfter.locator("td").nth(2)).toHaveText("break the ice");
  });

  test("subir un archivo con filas inválidas: se listan los problemas de la muestra", async ({
    page,
  }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/import");

    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/errors.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();

    await expect(
      page.getByText("0 filas válidas · 4 con problemas (con el mapeo por defecto)"),
    ).toBeVisible();
    await expect(page.getByText("Filas con problemas en la muestra")).toBeVisible();
    await expect(page.getByText("Fila 1: el frente está en blanco")).toBeVisible();
    await expect(page.getByText("Fila 2: el reverso está en blanco")).toBeVisible();
  });
});
