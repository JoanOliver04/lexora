import { expect, test, type ConsoleMessage } from "@playwright/test";

/**
 * Humo de la fundación técnica (M1).
 *
 * No hay producto todavía, así que estos tests no comprueban aprendizaje:
 * comprueban que la base sobre la que se va a construir funciona en un navegador
 * real. Son los que deben seguir pasando cuando se añada todo lo demás.
 */

test.describe("landing", () => {
  test("sirve cada idioma con su propio contenido y su atributo lang", async ({ page }) => {
    await page.goto("/es");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const spanish = await page.locator("main").innerText();

    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const english = await page.locator("main").innerText();

    // El atributo `lang` no es cosmético: los lectores de pantalla eligen la voz
    // a partir de él. Y si los dos idiomas sirvieran el mismo texto, el atributo
    // correcto no significaría nada.
    expect(spanish).not.toBe(english);
  });

  test("la raíz redirige a un idioma en lugar de dar un 404", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/(es|en)$/);
  });

  test("un idioma inexistente da 404, no una página en blanco", async ({ page }) => {
    const response = await page.goto("/fr");
    expect(response?.status()).toBe(404);
  });

  test("cambiar de idioma conserva la página y actualiza el documento", async ({ page }) => {
    await page.goto("/es");
    await page.getByLabel(/idioma de la interfaz/i).selectOption("en");

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("el tema elegido sobrevive a una recarga", async ({ page }) => {
    await page.goto("/es");

    const html = page.locator("html");
    await page.getByRole("radio", { name: "Oscuro" }).click();
    await expect(html).toHaveAttribute("data-theme", "dark");

    await page.reload();

    // Esto es lo que de verdad se comprueba: que el script síncrono del `<head>`
    // aplica el tema antes de que React hidrate. Si dependiera de un efecto,
    // habría un destello claro y este aserto pasaría igualmente, así que se
    // comprueba además que la preferencia quedó marcada.
    await expect(html).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("radio", { name: "Oscuro" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("no hay errores de consola al cargar", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message: ConsoleMessage) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error: Error) => errors.push(error.message));

    await page.goto("/es");
    await page.waitForLoadState("networkidle");

    expect(errors).toEqual([]);
  });
});
