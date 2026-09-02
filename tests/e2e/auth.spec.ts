import { expect, test } from "@playwright/test";

import { PASSWORD, signUp, uniqueEmail } from "./helpers";

/**
 * Flujos de autenticación con correo y contraseña (LEX-2.5).
 *
 * En local `enable_confirmations = false`, así que el alta deja sesión abierta
 * de inmediato y vuelve a la portada. La verificación por correo real se prueba
 * a mano (queda para el propietario).
 */

function hasAuthCookie(cookies: { name: string }[]): boolean {
  return cookies.some((cookie) => cookie.name.includes("auth-token"));
}

test.describe("autenticación", () => {
  test("alta, cierre y reinicio de sesión", async ({ page }) => {
    const email = await signUp(page);
    expect(hasAuthCookie(await page.context().cookies())).toBe(true);

    // Cerrar sesión desde la portada.
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL("/es/login");
    expect(hasAuthCookie(await page.context().cookies())).toBe(false);

    // Entrar de nuevo con las mismas credenciales.
    await page.goto("/es/login");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    await expect(page).toHaveURL("/es");
    expect(hasAuthCookie(await page.context().cookies())).toBe(true);
  });

  test("una contraseña incorrecta da un error genérico y no revela nada", async ({ page }) => {
    await page.goto("/es/login");
    await page.getByLabel("Correo").fill(uniqueEmail());
    await page.getByLabel("Contraseña").fill("no-es-la-buena");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();

    // `getByRole("alert")` también captura el anunciador de rutas de Next
    // (un div vacío), así que se localiza la región de error por su `id` y se
    // comprueba que lleva `role="alert"` y contiene el mensaje (LEX-2.10: el
    // rol pasó del `<p>` al contenedor `FormError`).
    const alert = page.locator("#login-error");
    await expect(alert).toHaveAttribute("role", "alert");
    await expect(alert).toContainText("El correo o la contraseña no son correctos.");
    await expect(page).toHaveURL(/\/es\/login/);
  });

  test("recuperar contraseña responde igual exista o no la cuenta", async ({ page }) => {
    await page.goto("/es/forgot-password");
    await page.getByLabel("Correo").fill(uniqueEmail());
    await page.getByRole("button", { name: "Enviar el enlace" }).click();

    await expect(page.getByRole("status")).toContainText("Revisa tu correo");
  });

  test("el alta se sirve en inglés bajo /en", async ({ page }) => {
    await page.goto("/en/signup");

    await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  });
});
