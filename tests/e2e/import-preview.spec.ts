import { expect, test, type Page } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * Wizard de importación (LEX-4.8) sobre preview, duplicados y lote
 * (LEX-4.4…4.7, §9.7 pasos 1–8).
 */
async function continueTo(page: Page, heading: string) {
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
}

async function walkToConfirm(page: Page) {
  await continueTo(page, "Mazo e inversa");
  await continueTo(page, "Duplicados");
  await continueTo(page, "Confirmar importación");
}

test.describe("importación — vista previa", () => {
  test("subir un TSV, ver separador y muestra, y reasignar columnas", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);

    await page.getByRole("link", { name: "Importar", exact: true }).click();
    await expect(page).toHaveURL("/es/import");
    await expect(page.getByRole("heading", { name: "Importar", level: 1 })).toBeVisible();

    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();

    await expect(page.getByRole("heading", { name: "Mapeo de columnas", level: 2 })).toBeVisible();
    await expect(page.getByText("Separador detectado: tabulación")).toBeVisible();
    await expect(page.getByText("2 filas válidas · sin problemas")).toBeVisible();
    await expect(page.getByText("2 nuevas · sin duplicados")).toBeVisible();

    const firstRow = page.locator("tbody tr").first();
    await expect(firstRow).toContainText("break the ice");
    await expect(firstRow).toContainText("romper el hielo");

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

    await expect(page.getByText("1 fila válida · 3 con problemas")).toBeVisible();
    await expect(page.getByText("1 nueva · sin duplicados")).toBeVisible();
    await expect(page.getByText("Filas con problemas en la muestra")).toBeVisible();
    await expect(page.getByText("Fila 1: el frente está en blanco")).toBeVisible();
    await expect(page.getByText("Fila 2: el reverso está en blanco")).toBeVisible();
  });

  test("un archivo de más de 10.000 filas se rechaza sin previsualizar", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/import");

    const content = Array.from({ length: 10_001 }, () => "a\tb\ttags").join("\n") + "\n";
    await page.getByLabel("Archivo").setInputFiles({
      name: "many.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(content, "utf8"),
    });
    await page.getByRole("button", { name: "Previsualizar" }).click();

    await expect(page.getByText("El archivo tiene más de 10.000 filas.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Vista previa" })).toHaveCount(0);
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
    await continueTo(page, "Mazo e inversa");
    await continueTo(page, "Duplicados");
    await expect(page.getByText("Fila 1: break the ice")).toBeVisible();
    await expect(page.getByText("(ya existe: Break the ice)")).toBeVisible();

    await page.getByRole("radio", { name: "Crear una copia independiente" }).check();
    await page.getByRole("button", { name: "2. Mapeo" }).click();
    await page.getByRole("button", { name: "Actualizar vista previa" }).click();
    await continueTo(page, "Mazo e inversa");
    await continueTo(page, "Duplicados");
    await expect(page.getByRole("radio", { name: "Crear una copia independiente" })).toBeChecked();
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
    await continueTo(page, "Mazo e inversa");
    await continueTo(page, "Duplicados");
    await expect(page.getByText("Fila 2: hello")).toBeVisible();
    await expect(page.getByText("(también en filas 1)")).toBeVisible();
  });

  test("sin mazo no se puede confirmar; con mazo, importar crea los conceptos", async ({
    page,
  }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/import");
    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();
    await expect(page.getByText("2 nuevas · sin duplicados")).toBeVisible();
    await walkToConfirm(page);
    await expect(page.getByText("Sin mazo de destino: créalo antes de importar.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Importar al curso" })).toHaveCount(0);

    await page.getByRole("link", { name: "Volver al inicio" }).click();
    await page.getByRole("link", { name: "Mis mazos" }).click();
    await page.getByLabel("Nombre").fill("Importados");
    await page.getByRole("button", { name: "Crear mazo" }).click();
    await expect(page.getByRole("link", { name: "Importados" })).toBeVisible();

    await page.goto("/es/import");
    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();
    await continueTo(page, "Mazo e inversa");
    await expect(page.getByLabel("Mazo de destino")).toBeVisible();
    await continueTo(page, "Duplicados");
    await continueTo(page, "Confirmar importación");
    await expect(page.getByText("Mazo: Importados")).toBeVisible();
    await page.getByRole("button", { name: "Importar al curso" }).click();
    await expect(page.getByRole("heading", { name: "Importación terminada" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Creadas: 2")).toBeVisible();
    await expect(page.getByText("Total: 2")).toBeVisible();

    await page.goto("/es/concepts");
    await expect(page.getByRole("link", { name: "break the ice", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "take off", exact: true })).toBeVisible();

    await page.goto("/es/import");
    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();
    await expect(page.getByText("2 posibles duplicadas")).toBeVisible();
    await walkToConfirm(page);
    await page.getByRole("button", { name: "Importar al curso" }).click();
    await expect(page.getByText("Creadas: 0")).toBeVisible();
    await expect(page.getByText("Omitidas: 2")).toBeVisible();
  });

  test("con inversa se crean dos ítems del mismo concepto", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.getByRole("link", { name: "Mis mazos" }).click();
    await page.getByLabel("Nombre").fill("Con inversa");
    await page.getByRole("button", { name: "Crear mazo" }).click();
    await expect(page.getByRole("link", { name: "Con inversa" })).toBeVisible();

    await page.goto("/es/import");
    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();
    await continueTo(page, "Mazo e inversa");
    await page
      .getByRole("checkbox", { name: "Crear también la dirección inversa (reverso → frente)" })
      .check();
    await continueTo(page, "Duplicados");
    await continueTo(page, "Confirmar importación");
    await expect(page.getByText("Se creará también la dirección inversa.")).toBeVisible();
    await page.getByRole("button", { name: "Importar al curso" }).click();
    await expect(page.getByRole("heading", { name: "Importación terminada" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Creadas: 2")).toBeVisible();

    await page.goto("/es/concepts");
    await page.getByRole("link", { name: "break the ice", exact: true }).click();
    const recognition = page.locator("li", { hasText: "break the ice → romper el hielo" });
    const recall = page.locator("li", { hasText: "romper el hielo → break the ice" });
    await expect(recognition).toBeVisible();
    await expect(recognition.getByText("Reconocimiento básico", { exact: true })).toBeVisible();
    await expect(recall).toBeVisible();
    await expect(recall.getByText("Recuperación básica", { exact: true })).toBeVisible();
  });

  test("un lote con filas inválidas lista los errores y permite descargarlos", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.getByRole("link", { name: "Mis mazos" }).click();
    await page.getByLabel("Nombre").fill("Importados");
    await page.getByRole("button", { name: "Crear mazo" }).click();
    await expect(page.getByRole("link", { name: "Importados" })).toBeVisible();

    await page.goto("/es/import");
    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/errors.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();
    await walkToConfirm(page);
    await page.getByRole("button", { name: "Importar al curso" }).click();

    await expect(page.getByRole("heading", { name: "Importación terminada" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Creadas: 1")).toBeVisible();
    await expect(page.getByText("Fallidas: 3")).toBeVisible();
    await expect(page.getByText("Total: 4")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Filas que no se importaron" })).toBeVisible();
    await expect(page.getByText("Fila 1: el frente está en blanco")).toBeVisible();
    await expect(page.getByText("Fila 2: el reverso está en blanco")).toBeVisible();
    await expect(
      page.getByText("Reintentar abre un trabajo nuevo", { exact: false }),
    ).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar errores" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("lexora-import-errors.txt");
  });

  test("el wizard avanza, vuelve atrás y deja el foco en el paso", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/import");
    await page.getByLabel("Archivo").setInputFiles("tests/fixtures/import/basic-tab.txt");
    await page.getByRole("button", { name: "Previsualizar" }).click();

    const mapping = page.getByRole("heading", { name: "Mapeo de columnas", level: 2 });
    await expect(mapping).toBeVisible();
    await expect(mapping).toBeFocused();
    await expect(page.getByRole("button", { name: "3. Mazo" })).toHaveCount(0);

    await continueTo(page, "Mazo e inversa");
    await expect(page.getByRole("heading", { name: "Mazo e inversa", level: 2 })).toBeFocused();

    await page.getByRole("button", { name: "Atrás" }).click();
    await expect(mapping).toBeVisible();
    await expect(mapping).toBeFocused();
    await expect(page.getByRole("button", { name: "3. Mazo" })).toBeVisible();
  });
});
