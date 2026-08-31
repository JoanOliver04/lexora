import { expect, test, type Page } from "@playwright/test";

/**
 * Onboarding (LEX-2.8).
 *
 * Un usuario recién registrado no tiene curso: al entrar en `/app` se le lleva
 * al onboarding; al completarlo, llega a `/app` en el idioma que eligió; y una
 * segunda visita al onboarding ya no tiene sentido y redirige a `/app`. El
 * estado de error del formulario se comprueba con un valor fuera de rango.
 */

function uniqueEmail(): string {
  return `e2e-onb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

const PASSWORD = "e2e-passw0rd";

async function signUp(page: Page): Promise<void> {
  await page.goto("/es/signup");
  await page.getByLabel("Correo").fill(uniqueEmail());
  await page.getByLabel("Contraseña").fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page).toHaveURL("/es");
}

function declaredLevel(page: Page) {
  return page.getByRole("group", { name: "¿Qué nivel de inglés dirías que tienes?" });
}

test.describe("onboarding", () => {
  test("sin curso, /app lleva al onboarding; completarlo lleva de vuelta a /app", async ({
    page,
  }) => {
    await signUp(page);

    await page.goto("/es/app");
    await expect(page).toHaveURL("/es/onboarding");
    await expect(page.getByRole("heading", { name: "Prepara tu curso" })).toBeVisible();

    // La aclaración de que el nivel declarado no certifica dominio es requisito
    // del alcance (§9.3).
    await expect(page.getByText("no certifica tu dominio ni bloquea contenido")).toBeVisible();

    await declaredLevel(page).getByRole("radio", { name: "B1 — Intermedio" }).check();
    await page.getByRole("button", { name: "Crear mi curso" }).click();

    await expect(page).toHaveURL("/es/app");
    await expect(page.getByRole("heading", { name: "Área privada" })).toBeVisible();

    // Repetir el onboarding ya no procede.
    await page.goto("/es/onboarding");
    await expect(page).toHaveURL("/es/app");
  });

  test("el onboarding se sirve en inglés bajo /en", async ({ page }) => {
    await signUp(page);

    await page.goto("/en/onboarding");
    await expect(page.getByRole("heading", { name: "Set up your course" })).toBeVisible();
    await expect(
      page.getByText("it doesn't certify your proficiency or lock content"),
    ).toBeVisible();
  });

  test("elegir English como idioma de interfaz deja la app en inglés", async ({ page }) => {
    await signUp(page);

    await page.goto("/es/onboarding");
    await page.getByRole("radio", { name: "English" }).check();
    await declaredLevel(page).getByRole("radio", { name: "A2 — Básico" }).check();
    await page.getByRole("button", { name: "Crear mi curso" }).click();

    await expect(page).toHaveURL("/en/app");
    await expect(page.getByRole("heading", { name: "Your space" })).toBeVisible();
  });

  test("un límite fuera de rango se rechaza con un mensaje y no crea el curso", async ({
    page,
  }) => {
    await signUp(page);
    await page.goto("/es/onboarding");

    await declaredLevel(page).getByRole("radio", { name: "A1 — Principiante" }).check();
    const limit = page.getByLabel("Ítems nuevos por día");
    await limit.fill("150");
    await page.getByRole("button", { name: "Crear mi curso" }).click();

    await expect(page).toHaveURL("/es/onboarding");
    // Se busca por el texto y no por `getByRole("alert")`: Next.js monta su
    // propio `role="alert"` (el anunciador de rutas) y la coincidencia sería
    // ambigua (mismo motivo que en `auth.spec.ts`).
    const message = page.getByText("Los ítems nuevos por día deben estar entre 0 y 100.");
    await expect(message).toBeVisible();
    await expect(limit).toHaveAttribute("aria-invalid", "true");

    // El curso no se ha creado: `/es/app` sigue rebotando al onboarding.
    await page.goto("/es/app");
    await expect(page).toHaveURL("/es/onboarding");
  });
});
