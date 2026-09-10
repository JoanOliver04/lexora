import { expect, test } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * Vista previa, mapeo y plan de duplicados (LEX-4.4…4.6, §9.7 pasos 1–4 y 7).
 *
 * Sube una fixture, ve el separador, la muestra y los recuentos
 * nuevas/duplicadas, cambia el mapeo sin re-subir. No persiste nada.
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
    await expect(page.getByText("2 filas válidas · sin problemas")).toBeVisible();
    await expect(page.getByText("2 nuevas · sin duplicados")).toBeVisible();
    await expect(page.getByRole("radio", { name: "Omitir las filas duplicadas" })).toBeChecked();

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

    // Con el mapeo de columnas, las columnas de más se ignoran: la cuarta
    // fila de errors.txt es válida. Las otras tres siguen siendo problemas.
    await expect(page.getByText("1 fila válida · 3 con problemas")).toBeVisible();
    await expect(page.getByText("1 nueva · sin duplicados")).toBeVisible();
    await expect(page.getByText("Filas con problemas en la muestra")).toBeVisible();
    await expect(page.getByText("Fila 1: el frente está en blanco")).toBeVisible();
    await expect(page.getByText("Fila 2: el reverso está en blanco")).toBeVisible();
  });

  test("un archivo de más de 5 MB se rechaza sin previsualizar", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/import");

    await page.getByLabel("Archivo").setInputFiles({
      name: "huge.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 97),
    });
    await page.getByRole("button", { name: "Previsualizar" }).click();

    await expect(page.getByText("El archivo supera los 5 MB.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vista previa" })).toHaveCount(0);
  });

  test("HTML importado se muestra como texto plano y un frente demasiado largo se lista", async ({
    page,
  }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/import");

    const longFront = "f".repeat(4001);
    const content = `<b>hello</b>\tworld\ttags\n${longFront}\tback\ttags\n`;
    await page.getByLabel("Archivo").setInputFiles({
      name: "mixed.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(content, "utf8"),
    });
    await page.getByRole("button", { name: "Previsualizar" }).click();

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText("hello");
    await expect(firstRow).not.toContainText("<b>");
    await expect(page.getByText("Fila 2: el frente es demasiado largo")).toBeVisible();
  });

  test("un concepto existente con el mismo frente se lista como posible duplicado", async ({
    page,
  }) => {
    await signUp(page);
    await completeOnboarding(page);

    await page.getByRole("link", { name: "Mis conceptos", exact: true }).click();
    await page.getByLabel("Título", { exact: true }).fill("Break the ice");
    await page.getByLabel("Resumen", { exact: true }).fill("Empezar una conversación");
    await page.getByRole("button", { name: "Crear concepto" }).click();
    await expect(page.getByRole("link", { name: "Break the ice", exact: true })).toBeVisible();

    await page.goto("/es/import");
    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();

    await expect(page.getByText("1 nueva · 1 posible duplicada")).toBeVisible();
    await expect(page.getByText("Fila 1: break the ice")).toBeVisible();
    await expect(page.getByText("(ya existe: Break the ice)")).toBeVisible();

    await page.getByRole("radio", { name: "Crear una copia independiente" }).check();
    await page.getByRole("button", { name: "Actualizar vista previa" }).click();
    await expect(page.getByRole("radio", { name: "Crear una copia independiente" })).toBeChecked();
    await expect(page.getByText("1 nueva · 1 posible duplicada")).toBeVisible();
  });

  test("dos frentes iguales en el archivo: la segunda fila es duplicada", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/import");

    const content = "hello\thola\ttags\nhello\thola otra vez\ttags\ngoodbye\tadiós\ttags\n";
    await page.getByLabel("Archivo").setInputFiles({
      name: "dupes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(content, "utf8"),
    });
    await page.getByRole("button", { name: "Previsualizar" }).click();

    await expect(page.getByText("2 nuevas · 1 posible duplicada")).toBeVisible();
    await expect(page.getByText("Fila 2: hello")).toBeVisible();
    await expect(page.getByText("(también en filas 1)")).toBeVisible();
  });
});
