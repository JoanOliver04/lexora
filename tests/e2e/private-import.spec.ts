import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * Importación del dataset privado de Anki (LEX-4.10). Se salta si
 * `LEXORA_PRIVATE_IMPORT_DIR` no apunta a la carpeta de TXT. CI y clones
 * sin el material no lo ejecutan. El contenido de las tarjetas no se aserta
 * ni se escribe en el reporte: solo recuentos.
 */
const DIR = process.env["LEXORA_PRIVATE_IMPORT_DIR"];

async function continueTo(page: Page, heading: string) {
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { name: heading, level: 2 })).toBeVisible();
}

async function walkToConfirm(page: Page) {
  await continueTo(page, "Mazo e inversa");
  await continueTo(page, "Duplicados");
  await continueTo(page, "Confirmar importación");
}

async function prepareImport(page: Page, deckTitle: string) {
  await signUp(page);
  await completeOnboarding(page);
  await page.getByRole("link", { name: "Mis mazos" }).click();
  await page.getByLabel("Nombre").fill(deckTitle);
  await page.getByRole("button", { name: "Crear mazo" }).click();
  await expect(page.getByRole("link", { name: deckTitle })).toBeVisible();
  await page.goto("/es/import");
}

function combinedDeckBuffer(dir: string): Buffer {
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".txt"))
    .sort();
  const bodies = names.map((name) => {
    const text = readFileSync(join(dir, name), "utf8");
    return text
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("#") && line.trim() !== "")
      .join("\n");
  });
  const combined = ["#separator:tab", "#html:false", "#tags column:3", ...bodies, ""].join("\n");
  return Buffer.from(combined, "utf8");
}

test.describe("importación — dataset privado", () => {
  test.skip(!DIR, "LEXORA_PRIVATE_IMPORT_DIR no está definido");

  test("A1_Pronunciacion.txt importa 44 conceptos", async ({ page }) => {
    await prepareImport(page, "A1 pronunciación");
    await page.getByLabel("Archivo").setInputFiles(join(DIR!, "A1_Pronunciacion.txt"));
    await page.getByRole("button", { name: "Previsualizar" }).click();
    await expect(page.getByText("44 filas válidas · sin problemas")).toBeVisible();
    await walkToConfirm(page);
    const started = Date.now();
    await page.getByRole("button", { name: "Importar al curso" }).click();
    await expect(page.getByRole("heading", { name: "Importación terminada" })).toBeVisible({
      timeout: 60_000,
    });
    const elapsedMs = Date.now() - started;
    await expect(page.getByText("Creadas: 44")).toBeVisible();
    await expect(page.getByText("Fallidas: 0")).toBeVisible();
    await expect(page.getByText("Total: 44")).toBeVisible();
    // eslint-disable-next-line no-console -- evidencia, sin contenido de tarjetas
    console.log(JSON.stringify({ file: "A1_Pronunciacion.txt", elapsedMs }));
  });

  test("el conjunto de 1016 filas: 1013 creadas, 3 omitidas", async ({ page }, testInfo) => {
    test.setTimeout(240_000);
    test.skip(
      testInfo.project.name !== "escritorio-chromium",
      "el lote completo solo se cronometra en escritorio",
    );
    await prepareImport(page, "Inglés A1–B2");
    await page.getByLabel("Archivo").setInputFiles({
      name: "anki-all.txt",
      mimeType: "text/plain",
      buffer: combinedDeckBuffer(DIR!),
    });
    await page.getByRole("button", { name: "Previsualizar" }).click();
    await expect(page.getByText("1016 filas válidas · sin problemas")).toBeVisible();
    await expect(page.getByText("1013 nuevas · 3 posibles duplicadas")).toBeVisible();
    await walkToConfirm(page);
    const started = Date.now();
    await page.getByRole("button", { name: "Importar al curso" }).click();
    await expect(page.getByRole("heading", { name: "Importación terminada" })).toBeVisible({
      timeout: 180_000,
    });
    const elapsedMs = Date.now() - started;
    await expect(page.getByText("Creadas: 1013")).toBeVisible();
    await expect(page.getByText("Omitidas: 3")).toBeVisible();
    await expect(page.getByText("Duplicadas: 3")).toBeVisible();
    await expect(page.getByText("Fallidas: 0")).toBeVisible();
    await expect(page.getByText("Total: 1016")).toBeVisible();
    // eslint-disable-next-line no-console -- evidencia, sin contenido de tarjetas
    console.log(JSON.stringify({ file: "anki-all.txt", elapsedMs }));
  });
});
