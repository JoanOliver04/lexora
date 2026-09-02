import { expect, test } from "@playwright/test";

import { completeOnboarding, signUp } from "./helpers";

/**
 * Aislamiento A/B en la capa de interfaz (LEX-2.11, cierre de M2).
 *
 * RLS ya está probado en `040` (pgTAP, 36 asserciones dueño / no-dueño / anon /
 * service_role) y el servidor toma el `userId` de `getClaims()`, nunca de un
 * parámetro. Lo que ningún test cubría de punta a punta es que **dos usuarios
 * con sesión a la vez** ven cada uno *su* curso.
 *
 * Señal que distingue de quién es el curso: `courses.title` se fija al crearlo,
 * a partir del `ui_locale` de ese usuario (`complete_onboarding`). A hace el
 * onboarding en español → su curso se titula «Inglés»; B en inglés → «English».
 * Ese título viaja con el curso: aunque A mire `/en/app`, el encabezado sigue
 * diciendo «Inglés» —su curso—, no «English».
 */

test("dos usuarios con sesión simultánea ven cada uno su propio curso", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await signUp(pageA);
    await completeOnboarding(pageA, { uiLocale: "es", declaredLevel: "B1 — Intermedio" });
    await expect(pageA.getByRole("heading", { name: "Inglés" })).toBeVisible();
    await expect(pageA.getByText("Tu curso")).toBeVisible();

    await signUp(pageB);
    await completeOnboarding(pageB, { uiLocale: "en", declaredLevel: "A2 — Básico" });
    await expect(pageB.getByRole("heading", { name: "English" })).toBeVisible();
    await expect(pageB.getByText("Your course")).toBeVisible();

    // La actividad de B no cambia lo que ve A.
    await pageA.goto("/es/app");
    await expect(pageA).toHaveURL("/es/app");
    await expect(pageA.getByRole("heading", { name: "Inglés" })).toBeVisible();

    // A mirando bajo `/en`: el chrome cambia de idioma, pero el curso sigue
    // siendo el suyo —el título «Inglés» se fijó al crearlo con su `ui_locale`—.
    await pageA.goto("/en/app");
    await expect(pageA.getByRole("heading", { name: "Inglés" })).toBeVisible();
    await expect(pageA.getByText("Your course")).toBeVisible();

    // B, en el otro sentido: su curso «English» bajo el chrome en español.
    await pageB.goto("/es/app");
    await expect(pageB.getByRole("heading", { name: "English" })).toBeVisible();
    await expect(pageB.getByText("Tu curso")).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
