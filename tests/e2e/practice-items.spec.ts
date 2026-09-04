import { expect, test } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * Ítems básicos y dirección inversa (LEX-3.7).
 *
 * Un usuario con un concepto crea un ítem `basic_recognition` y uno `cloze`,
 * edita el primero, crea su inverso (`basic_recall` del **mismo** concepto,
 * enunciado/respuesta intercambiados) y archiva un ítem. Aislamiento A/B ya
 * lo cubre pgTAP `090`, no se repite aquí.
 */
test.describe("ítems de práctica", () => {
  async function createConcept(page: import("@playwright/test").Page, title: string) {
    await page.goto("/es/concepts");
    await page.getByLabel("Título", { exact: true }).fill(title);
    await page.getByLabel("Resumen", { exact: true }).fill("Resumen de prueba");
    await page.getByRole("button", { name: "Crear concepto" }).click();
    await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
    await page.getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(/\/es\/concepts\/[0-9a-f-]+$/);
    return page.url();
  }

  test("crear un ítem básico, editarlo y crear su inverso", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    const conceptUrl = await createConcept(page, "Take off");

    await expect(page.getByText("Este concepto no tiene ítems de práctica todavía.")).toBeVisible();

    // Crear: el modo por defecto es "Reconocimiento básico".
    await page.getByLabel("Enunciado", { exact: true }).fill("take off");
    await page.getByLabel("Respuesta", { exact: true }).fill("despegar");
    await page.getByRole("button", { name: "Crear ítem" }).click();
    await expect(page).toHaveURL(conceptUrl);
    const recognitionRow = page.locator("li", { hasText: "take off → despegar" });
    await expect(recognitionRow).toBeVisible();
    await expect(recognitionRow.getByText("Reconocimiento básico", { exact: true })).toBeVisible();

    // Editar desde el detalle del ítem. La previsualización (LEX-3.11) ya
    // muestra el enunciado; la respuesta queda oculta hasta «Ver respuesta».
    await page.getByRole("link", { name: "Editar", exact: true }).click();
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/);
    await expect(page.getByText("Cómo se verá al estudiar")).toBeVisible();
    await expect(page.getByText("take off", { exact: true })).toBeVisible();
    await page.getByText("Ver respuesta", { exact: true }).click();
    await expect(page.getByText("despegar", { exact: true })).toBeVisible();

    await page.getByLabel("Pista (opcional)", { exact: true }).fill("un avión");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page).toHaveURL(conceptUrl);

    // Crear el inverso: aparece un segundo ítem, "Recuperación básica", con
    // enunciado y respuesta intercambiados, del mismo concepto (misma URL).
    await page.getByRole("button", { name: "Crear el inverso" }).first().click();
    await expect(page).toHaveURL(conceptUrl);
    const recallRow = page.locator("li", { hasText: "despegar → take off" });
    await expect(recallRow).toBeVisible();
    await expect(recallRow.getByText("Recuperación básica", { exact: true })).toBeVisible();
    // El original sigue ahí: son dos ítems, no uno sustituido.
    await expect(recognitionRow).toBeVisible();
  });

  test("crear un ítem cloze y archivarlo", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    const conceptUrl = await createConcept(page, "Break the ice");

    await page.getByLabel("Modo", { exact: true }).selectOption({ label: "Completar huecos" });
    await page.getByLabel("Enunciado", { exact: true }).fill("Let's ___ the ice.");
    await page.getByLabel("Respuesta", { exact: true }).fill("break");
    await page.getByLabel("Soluciones del hueco (una por línea)", { exact: true }).fill("break");
    await page.getByRole("button", { name: "Crear ítem" }).click();
    await expect(page).toHaveURL(conceptUrl);
    const clozeRow = page.locator("li", { hasText: "Let's ___ the ice. → break" });
    await expect(clozeRow).toBeVisible();
    await expect(clozeRow.getByText("Completar huecos", { exact: true })).toBeVisible();

    // Un ítem cloze no tiene inversa: el botón no se ofrece.
    await expect(page.getByRole("button", { name: "Crear el inverso" })).toHaveCount(0);

    await page.getByRole("link", { name: "Editar", exact: true }).click();
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/);

    // La previsualización de un `cloze` muestra el enunciado tal cual se
    // guardó (sin marcador de hueco propio, LEX-3.7 no fijó ninguno) y, al
    // revelar la respuesta, las soluciones del hueco por separado.
    await expect(page.getByText("Let's ___ the ice.", { exact: true })).toBeVisible();
    await page.getByText("Ver respuesta", { exact: true }).click();
    await expect(page.getByText("Soluciones del hueco, en orden")).toBeVisible();
    await expect(page.locator("ol li", { hasText: "break" })).toBeVisible();

    await page.getByRole("button", { name: "Archivar" }).click();
    await expect(page).toHaveURL(conceptUrl);
    await expect(page.getByText("Archivado", { exact: true })).toBeVisible();
  });

  test("un ítem sin enunciado no se crea y muestra el error", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await createConcept(page, "Give up");

    await page.getByLabel("Respuesta", { exact: true }).fill("rendirse");
    await page.getByRole("button", { name: "Crear ítem" }).click();

    await expect(page.getByText("Escribe el enunciado.")).toBeVisible();
    await expect(page.getByLabel("Enunciado", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
});
