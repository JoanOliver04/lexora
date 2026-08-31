"use server";

import { redirect } from "next/navigation";

import { completeOnboardingForCurrentUser } from "@/composition/onboarding";
import { routing } from "@/i18n/routing";
import type { OnboardingIssue } from "@/modules/courses/domain/onboarding";

/**
 * Server Action del onboarding. Delgada (ADR-001): lee el formulario, llama a
 * la composición y devuelve **claves de error estables** que el componente
 * traduce. La validación real es del dominio (`validateOnboardingSelection`),
 * dentro del caso de uso.
 *
 * En éxito redirige a `/{uiLocale}/app` —en el idioma que la persona acaba de
 * elegir—. `uiLocale` entra en un `redirect()`, así que se valida contra la
 * lista de idiomas igual que se hace con `locale` y `next` en `(auth)`.
 */

export interface OnboardingFormState {
  issues?: OnboardingIssue[];
  error?: "generic";
}

function safeLocale(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value : "";
  return routing.locales.includes(raw as (typeof routing.locales)[number]) ? raw : fallback;
}

function parseDailyNewLimit(value: FormDataEntryValue | null): number {
  const raw = typeof value === "string" ? value.trim() : "";
  // `Number("")` es `0`, que está dentro del rango válido: un campo vacío
  // pasaría como «0 ítems nuevos» sin avisar. Se fuerza a `NaN` para que el
  // dominio lo rechace con `dailyNewLimit.notInteger`.
  return raw === "" ? Number.NaN : Number(raw);
}

export async function onboardingAction(
  _prev: OnboardingFormState,
  formData: FormData,
): Promise<OnboardingFormState> {
  const fallbackLocale = safeLocale(formData.get("locale"), routing.defaultLocale);

  const outcome = await completeOnboardingForCurrentUser({
    uiLocale: formData.get("uiLocale"),
    declaredLevel: formData.get("declaredLevel"),
    startLevel: formData.get("startLevel"),
    dailyNewLimit: parseDailyNewLimit(formData.get("dailyNewLimit")),
  });

  if (outcome === null) {
    // Sin sesión: la puerta de `(app)/layout.tsx` ya debería haber redirigido.
    return { error: "generic" };
  }
  if (!outcome.ok) {
    return { issues: outcome.issues };
  }

  redirect(`/${safeLocale(formData.get("uiLocale"), fallbackLocale)}/app`);
}
