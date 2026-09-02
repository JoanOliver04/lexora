import { expect, test } from "@playwright/test";

import { completeOnboarding, PASSWORD, signUp } from "./helpers";

/**
 * Puerta del área autenticada (LEX-2.6).
 *
 * Un anónimo no entra; al autenticarse se llega al destino que se pidió; al
 * cerrar sesión, el área vuelve a estar cerrada. Y la respuesta de una ruta
 * privada no es cacheable de forma compartida.
 */

test.describe("área autenticada", () => {
  test("un anónimo es redirigido a login conservando el destino", async ({ page }) => {
    await page.goto("/es/app");

    await expect(page).toHaveURL(/\/es\/login\?next=%2Fes%2Fapp$/);
    await expect(page.getByRole("heading", { name: "Entrar en Lexora" })).toBeVisible();
  });

  test("tras entrar se llega al destino guardado; al salir se cierra otra vez", async ({
    page,
  }) => {
    const email = await signUp(page);

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
    // El shell muestra el curso activo; con onboarding por defecto (es) es "Inglés".
    await expect(page.getByRole("heading", { name: "Inglés" })).toBeVisible();

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
