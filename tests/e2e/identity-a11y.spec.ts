import { expect, test, type Page } from "@playwright/test";

/**
 * Accesibilidad de los estados de error de identidad (LEX-2.10).
 *
 * Tras un envío fallido el foco va al primer campo inválido, y vuelve a ir en
 * cada reenvío —aunque el usuario haya movido el foco entre medias y el error
 * sea el mismo—. En el onboarding, un grupo de radios sin elegir se marca como
 * inválido y recibe el foco.
 *
 * No se usa `getByRole("alert")`: Next.js monta su propio anunciador de rutas
 * con ese rol y la coincidencia sería ambigua (igual que en `auth.spec.ts` y
 * `onboarding.spec.ts`).
 */

function uniqueEmail(): string {
  return `e2e-a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-passw0rd";

async function signUp(page: Page): Promise<void> {
  await page.goto("/es/signup");
  await page.getByLabel("Correo").fill(uniqueEmail());
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL("/es");
}

test.describe("accesibilidad de errores de identidad", () => {
  test("el login lleva el foco al primer campo inválido en cada intento", async ({ page }) => {
    await page.goto("/es/login");
    const email = page.getByLabel("Correo");
    const password = page.getByLabel("Contraseña");
    const submit = page.getByRole("button", { name: "Entrar", exact: true });

    // Envío en vacío (el formulario lleva `noValidate`): credenciales inválidas.
    await submit.click();
    await expect(page.getByText("El correo o la contraseña no son correctos.")).toBeVisible();
    await expect(email).toBeFocused();
    await expect(email).toHaveAttribute("aria-invalid", "true");
    await expect(email).toHaveAttribute("aria-describedby", "login-error");

    // El usuario rellena y el foco queda en el campo de contraseña. Reenvío con
    // el mismo error: el foco vuelve al primer campo inválido.
    await email.fill("alguien@example.com");
    await password.fill("contrasena-incorrecta");
    await expect(password).toBeFocused();
    await submit.click();
    await expect(email).toBeFocused();
  });

  test("un grupo de radios sin elegir en el onboarding se marca y recibe el foco", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/es/onboarding");

    // Solo el nivel declarado no tiene valor por defecto: se envía sin tocarlo.
    await page.getByRole("button", { name: "Crear mi curso" }).click();

    await expect(page).toHaveURL("/es/onboarding");
    const group = page.getByRole("group", { name: "¿Qué nivel de inglés dirías que tienes?" });
    await expect(page.getByText("Elige tu nivel actual.")).toBeVisible();
    await expect(group).toHaveAttribute("aria-invalid", "true");
    await expect(group).toBeFocused();
  });
});
