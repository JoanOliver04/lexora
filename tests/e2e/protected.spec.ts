import { expect, test, type Page } from "@playwright/test";

/**
 * Puerta del área autenticada (LEX-2.6).
 *
 * Un anónimo no entra; al autenticarse se llega al destino que se pidió; al
 * cerrar sesión, el área vuelve a estar cerrada. Y la respuesta de una ruta
 * privada no es cacheable de forma compartida.
 */

function uniqueEmail(): string {
  return `e2e-prot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-passw0rd";

/**
 * Deja al usuario en curso con el onboarding hecho, para que `/{locale}/app`
 * sea alcanzable. El detalle del formulario se prueba en `onboarding.spec.ts`;
 * aquí solo hay que cruzar la puerta.
 */
async function completeOnboarding(page: Page): Promise<void> {
  await page.goto("/es/onboarding");
  await page
    .getByRole("group", { name: "¿Qué nivel de inglés dirías que tienes?" })
    .getByRole("radio", { name: "A1 — Principiante" })
    .check();
  await page.getByRole("button", { name: "Crear mi curso" }).click();
  await expect(page).toHaveURL("/es/app");
}

test.describe("área autenticada", () => {
  test("un anónimo es redirigido a login conservando el destino", async ({ page }) => {
    await page.goto("/es/app");

    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fapp$/);
    await expect(page.getByRole("heading", { name: "Entrar en Lexora" })).toBeVisible();
  });

  test("tras entrar se llega al destino guardado; al salir se cierra otra vez", async ({
    page,
  }) => {
    const email = uniqueEmail();

    await page.goto("/es/signup");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page).toHaveURL("/es");

    // El usuario recién creado no tiene curso: se hace el onboarding una vez
    // para que `/es/app` deje de rebotar a `/es/onboarding`.
    await completeOnboarding(page);

    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL("/es/login");

    // Ir a una ruta privada, autenticarse desde el login al que redirige, y
    // acabar en la ruta que se pidió.
    await page.goto("/es/app");
    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fapp$/);
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page).toHaveURL("/es/app");
    await expect(page.getByRole("heading", { name: "Área privada" })).toBeVisible();

    // Salir desde dentro del área privada.
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL("/es/login");

    // El área vuelve a estar cerrada.
    await page.goto("/es/app");
    await expect(page).toHaveURL(/\/es\/login/);
  });

  test("la respuesta de una ruta privada no es cacheable de forma compartida", async ({
    request,
  }) => {
    const response = await request.get("/es/app", { maxRedirects: 0 });

    expect(response.status()).toBe(307);
    expect(response.headers()["cache-control"] ?? "").toContain("no-store");
  });
});
