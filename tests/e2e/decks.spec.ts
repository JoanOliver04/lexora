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

  test("buscar por título y filtrar por categoría (LEX-3.9)", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/decks");

    await page.getByLabel("Nombre", { exact: true }).fill("Phrasal verbs");
    await page.getByLabel("Categoría (opcional)").selectOption("vocabulary");
    await page.getByRole("button", { name: "Crear mazo" }).click();
    await expect(page.getByRole("link", { name: "Phrasal verbs", exact: true })).toBeVisible();

    await page.getByLabel("Nombre", { exact: true }).fill("Tiempos verbales");
    await page.getByLabel("Categoría (opcional)").selectOption("grammar");
    await page.getByRole("button", { name: "Crear mazo" }).click();
    await expect(page.getByRole("link", { name: "Tiempos verbales", exact: true })).toBeVisible();

    // Buscar por texto: solo el que coincide con el título.
    await page.getByLabel("Buscar", { exact: true }).fill("Phrasal");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/[?&]q=Phrasal/);
    await expect(page.getByRole("link", { name: "Phrasal verbs", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tiempos verbales", exact: true })).toHaveCount(0);

    // Quitar filtros: vuelven a verse los dos.
    await page.getByRole("link", { name: "Quitar filtros" }).click();
    await expect(page).toHaveURL("/es/decks");
    await expect(page.getByRole("link", { name: "Phrasal verbs", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Tiempos verbales", exact: true })).toBeVisible();

    // Filtrar por categoría: solo el de gramática.
    await page.getByLabel("Categoría", { exact: true }).selectOption("grammar");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(/[?&]category=grammar/);
    await expect(page.getByRole("link", { name: "Tiempos verbales", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Phrasal verbs", exact: true })).toHaveCount(0);

    // Una búsqueda sin coincidencias muestra el mensaje de «sin resultados»,
    // no el de «biblioteca vacía».
    await page.getByRole("link", { name: "Quitar filtros" }).click();
    await page.getByLabel("Buscar", { exact: true }).fill("no existe ningún mazo así");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByText("Ningún mazo coincide con la búsqueda.")).toBeVisible();
  });

  test("paginación: más de una página muestra el siguiente/anterior mazo", async ({ page }) => {
    await signUp(page);
    await completeOnboarding(page);
    await page.goto("/es/decks");

    // 21 mazos: uno más que el tamaño de página (20). Reordenar se oculta con
    // más de una página; no se comprueba aquí. El 21.º cae en la página 2:
    // creado el vigésimo, `main` deja de contener enlaces a mazos y solo hay
    // que esperar a que el formulario vuelva a estar listo, no a que el
    // propio mazo se vea (no aparecerá en la página 1).
    for (let index = 1; index <= 21; index += 1) {
      const name = `Mazo ${String(index).padStart(2, "0")}`;
      await page.getByLabel("Nombre", { exact: true }).fill(name);
      await page.getByRole("button", { name: "Crear mazo" }).click();
      if (index <= 20) {
        await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
      } else {
        await expect(page.getByLabel("Nombre", { exact: true })).toBeVisible();
      }
    }

    // El primero (por `position`) sigue en la página 1; el 21.º está en la 2.
    await expect(page.getByRole("link", { name: "Mazo 01", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mazo 21", exact: true })).toHaveCount(0);
    await expect(page.getByText("Página 1 de 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Subir" })).toHaveCount(0);

    await page.getByRole("link", { name: "Siguiente" }).click();
    await expect(page).toHaveURL(/\/es\/decks\?page=2/);
    await expect(page.getByRole("link", { name: "Mazo 21", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mazo 01", exact: true })).toHaveCount(0);
    await expect(page.getByText("Página 2 de 2")).toBeVisible();

    await page.getByRole("link", { name: "Anterior" }).click();
    await expect(page).toHaveURL("/es/decks");
    await expect(page.getByRole("link", { name: "Mazo 01", exact: true })).toBeVisible();
  });
});
