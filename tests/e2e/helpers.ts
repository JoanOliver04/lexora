import { expect, type Page } from "@playwright/test";

/**
 * Utilidades compartidas de los E2E de identidad (LEX-2.11).
 *
 * Antes cada spec repetía su propio `uniqueEmail` y su propio `signUp`. Al
 * unificarlos, el reintento de alta descrito abajo se aplica a toda la suite,
 * no solo a un spec.
 */

export const PASSWORD = "e2e-passw0rd";

/** Correo único por invocación; el prefijo ayuda a ubicar el spec de origen. */
export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/**
 * Registra un usuario nuevo y espera a caer en la portada con sesión abierta.
 * Devuelve el correo usado (el que tiene sesión), para el login posterior.
 *
 * **Reintento de preparación, no política global.** Bajo carga local con varios
 * workers de Playwright, el alta cae de forma intermitente en una página de
 * error de Next (`__next_error__`) en lugar de redirigir a `/es` — visto una vez
 * cada ~8 pasadas completas en LEX-2.7/2.9/2.10, **nunca en CI** (un worker + un
 * reintento de Playwright). No se reprodujo en ~10 pasadas dirigidas y la
 * hipótesis de límite de peticiones se descartó por sondeo directo (45 altas
 * seguidas, todas `200`). Como es un fallo de *preparación* y no una aserción
 * del producto, se reintenta una vez con un correo nuevo; `playwright.config.ts`
 * mantiene `retries: 0` en local para que un test inestable de verdad se note.
 * Ver `docs/evidence/LEX-2.11.md`.
 */
export async function signUp(page: Page, opts: { email?: string } = {}): Promise<string> {
  let email = opts.email ?? uniqueEmail();

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt === 2 && !opts.email) {
      email = uniqueEmail();
    }
    await page.goto("/es/signup");
    await page.getByLabel("Correo").fill(email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByRole("button", { name: "Crear cuenta" }).click();

    try {
      await expect(page).toHaveURL("/es", { timeout: 10_000 });
      return email;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }

  return email;
}

/**
 * Deja al usuario actual con el onboarding hecho y en `/{uiLocale}/app`. El
 * detalle del formulario se prueba en `onboarding.spec.ts`; aquí solo se cruza.
 */
export async function completeOnboarding(
  page: Page,
  opts: { declaredLevel?: string; uiLocale?: "es" | "en" } = {},
): Promise<void> {
  const declaredLevel = opts.declaredLevel ?? "A1 — Principiante";
  const uiLocale = opts.uiLocale ?? "es";

  await page.goto("/es/onboarding");
  if (uiLocale === "en") {
    await page.getByRole("radio", { name: "English" }).check();
  }
  await page
    .getByRole("group", { name: "¿Qué nivel de inglés dirías que tienes?" })
    .getByRole("radio", { name: declaredLevel })
    .check();
  await page.getByRole("button", { name: "Crear mi curso" }).click();
  await expect(page).toHaveURL(`/${uiLocale}/app`);
}
