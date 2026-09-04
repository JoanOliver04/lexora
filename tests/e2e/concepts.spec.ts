import { expect, test } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * CRUD de conceptos, etiquetas y vínculo con un mazo (LEX-3.6).
 *
 * Un usuario con curso crea un concepto, lo edita (la identidad se conserva:
 * mismo id antes y después), lo etiqueta por nombre, quita la etiqueta,
 * archiva el concepto y lo ve salir de la lista por defecto. Un caso aparte
 * vincula un concepto existente a un mazo desde el detalle del mazo (LEX-3.5)
 * y comprueba que el recuento y la lista se actualizan. Aislamiento A/B ya lo
 * cubre pgTAP `090`, no se repite aquí.
 */
test.describe("conceptos", () => {
  test("crear, editar (conserva identidad), etiquetar y archivar un concepto", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);

    await page.getByRole("link", { name: "Mis conceptos", exact: true }).click();
    await expect(page).toHaveURL("/es/concepts");
    await expect(page.getByRole("heading", { name: "Conceptos", level: 1 })).toBeVisible();
    await expect(page.getByText("Todavía no tienes conceptos en este curso")).toBeVisible();

    // Crear: el resumen es obligatorio, el tipo tiene un valor por defecto.
    await page.getByLabel("Título", { exact: true }).fill("Break the ice");
    await page.getByLabel("Resumen", { exact: true }).fill("Romper el hielo en una conversación");
    await page.getByRole("button", { name: "Crear concepto" }).click();
    await expect(page.getByRole("link", { name: "Break the ice", exact: true })).toBeVisible();

    // Editar desde el detalle: identidad conservada (mismo id antes y después).
    await page.getByRole("link", { name: "Break the ice", exact: true }).click();
    await expect(page).toHaveURL(/\/es\/concepts\/[0-9a-f-]+$/);
    const conceptId = page.url().split("/").pop();

    await page.getByLabel("Título", { exact: true }).fill("Break the ice (idiom)");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page).toHaveURL("/es/concepts");
    await page.getByRole("link", { name: "Break the ice (idiom)", exact: true }).click();
    await expect(page).toHaveURL(`/es/concepts/${conceptId}`);

    // Etiquetar por nombre: crea la etiqueta y la asocia en un solo paso.
    await page.getByLabel("Nueva etiqueta", { exact: true }).fill("phrasal-verbs");
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
    await expect(page).toHaveURL(`/es/concepts/${conceptId}`);
    await expect(page.getByText("phrasal-verbs", { exact: true })).toBeVisible();

    // Quitar la etiqueta.
    await page.getByRole("button", { name: "Quitar: phrasal-verbs" }).click();
    await expect(page).toHaveURL(`/es/concepts/${conceptId}`);
    await expect(page.getByText("Este concepto no tiene etiquetas.")).toBeVisible();

    // Archivar: sale de la lista por defecto.
    await page.getByRole("button", { name: "Archivar" }).click();
    await expect(page).toHaveURL("/es/concepts");
    await expect(
      page.getByRole("link", { name: "Break the ice (idiom)", exact: true }),
    ).toHaveCount(0);
  });

  test("un concepto sin resumen no se crea y muestra el error", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);

    await page.goto("/es/concepts");
    await page.getByLabel("Título", { exact: true }).fill("Sin resumen");
    await page.getByRole("button", { name: "Crear concepto" }).click();

    await expect(page).toHaveURL("/es/concepts");
    await expect(page.getByText("Escribe un resumen.")).toBeVisible();
    await expect(page.getByLabel("Resumen", { exact: true })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  test("etiquetar con distinta capitalización reutiliza la misma etiqueta", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);

    for (const title of ["Idiom A", "Idiom B"]) {
      await page.goto("/es/concepts");
      await page.getByLabel("Título", { exact: true }).fill(title);
      await page.getByLabel("Resumen", { exact: true }).fill("Resumen de prueba");
      await page.getByRole("button", { name: "Crear concepto" }).click();
      await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
    }

    await page.getByRole("link", { name: "Idiom A", exact: true }).click();
    await page.getByLabel("Nueva etiqueta", { exact: true }).fill("Idioms");
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
    await expect(page.getByText("Idioms", { exact: true })).toBeVisible();

    // Misma etiqueta, distinta capitalización: se reutiliza la fila existente
    // (por `normalizedName`) en vez de intentar crear una nueva y chocar con
    // el índice único del curso.
    await page.goto("/es/concepts");
    await page.getByRole("link", { name: "Idiom B", exact: true }).click();
    await page.getByLabel("Nueva etiqueta", { exact: true }).fill("idioms");
    await page.getByRole("button", { name: "Añadir", exact: true }).click();
    // El nombre visible sigue siendo el de la primera vez que se creó: prueba
    // que es la misma fila, no una etiqueta nueva "idioms" en minúsculas.
    await expect(page.getByText("Idioms", { exact: true })).toBeVisible();
    await expect(page.getByText("idioms", { exact: true })).toHaveCount(0);
  });

  test("vincular un concepto existente a un mazo desde el detalle del mazo", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);

    await page.goto("/es/concepts");
    await page.getByLabel("Título", { exact: true }).fill("Get on with");
    await page
      .getByLabel("Resumen", { exact: true })
      .fill("Llevarse bien con alguien / continuar con algo");
    await page.getByRole("button", { name: "Crear concepto" }).click();
    await expect(page.getByRole("link", { name: "Get on with", exact: true })).toBeVisible();

    await page.goto("/es/decks");
    await page.getByLabel("Nombre", { exact: true }).fill("Phrasal verbs");
    await page.getByRole("button", { name: "Crear mazo" }).click();
    await expect(page.getByRole("link", { name: "Phrasal verbs", exact: true })).toBeVisible();
    await expect(page.getByText("Sin conceptos")).toBeVisible();

    await page.getByRole("link", { name: "Phrasal verbs", exact: true }).click();
    await expect(page).toHaveURL(/\/es\/decks\/[0-9a-f-]+$/);

    await page.getByLabel("Concepto", { exact: true }).selectOption({ label: "Get on with" });
    await page.getByRole("button", { name: "Añadir al mazo" }).click();
    await expect(page.getByText("1 concepto", { exact: true })).toBeVisible();
    await expect(page.getByText("Get on with", { exact: true })).toBeVisible();

    // El recuento de la lista de mazos también refleja el vínculo.
    await page.getByRole("link", { name: "Volver a los mazos" }).click();
    await expect(page).toHaveURL("/es/decks");
    await expect(page.getByText("1 concepto", { exact: true })).toBeVisible();

    // Quitar el vínculo: el mazo vuelve a estar vacío.
    await page.getByRole("link", { name: "Phrasal verbs", exact: true }).click();
    await page.getByRole("button", { name: "Quitar del mazo" }).click();
    await expect(page.getByText("Este mazo no tiene conceptos todavía.")).toBeVisible();
  });
});
