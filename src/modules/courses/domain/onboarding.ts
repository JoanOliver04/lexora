/**
 * Dominio del onboarding (LEX-2.7).
 *
 * Lógica pura: sin React, sin Next.js, sin base de datos. Describe **qué** es
 * una selección de onboarding válida (MASTER_SPEC §9.3) y la valida. El
 * **cómo** —crear el curso y su configuración de forma idempotente— vive en la
 * capa de aplicación y, al final, en la función SQL `complete_onboarding`.
 *
 * De los siete pasos de §9.3, solo cuatro son una elección real del usuario:
 *
 *   1. idioma de interfaz — `es` | `en`;
 *   4. nivel académico declarado — un nivel CEFR;
 *   5. nivel desde el que empezar dentro de la app — un nivel CEFR, A1 por
 *      defecto (repaso acelerado);
 *   6. límite de ítems nuevos diarios — entero 0..100, recomendado 5.
 *
 * Los pasos 2 y 3 son «confirmar», no «elegir»: el idioma de apoyo (español) y
 * el objetivo (inglés `en-GB`) son fijos en la V1 y viven aquí como constantes,
 * no como entrada. El paso 7 (crear curso / importar) es la operación, no un
 * dato.
 */

/** Idioma de interfaz de la aplicación (`profiles.ui_locale`). */
export type UiLocale = "es" | "en";

/** Nivel del Marco Común Europeo. Coincide con el enum `public.cefr_level`. */
export type CefrLevel = "A1" | "A2" | "B1" | "B2";

export const UI_LOCALES: readonly UiLocale[] = ["es", "en"];
export const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2"];

/**
 * Curso de referencia (seed.sql, DATA_MODEL §6.3). Fuente única para el
 * onboarding y la demo. El idioma de apoyo y el objetivo son fijos en la V1;
 * la persona solo confirma que son estos.
 */
export const REFERENCE_COURSE = {
  supportLanguage: { code: "es", locale: "es" },
  targetLanguage: { code: "en", locale: "en" },
  targetLocale: "en-GB",
} as const;

/** A1 recomendado en el paso 5: repaso acelerado desde el principio. */
export const DEFAULT_START_LEVEL: CefrLevel = "A1";

/** Recomendación inicial del paso 6. */
export const RECOMMENDED_DAILY_NEW_LIMIT = 5;

/**
 * Rango de `daily_new_limit`. Coincide a propósito con el CHECK
 * `course_settings_daily_new_limit_range` (LEX-2.1): la base de datos es el
 * guardián último; esto solo permite un mensaje claro antes de llegar allí.
 */
export const DAILY_NEW_LIMIT_MIN = 0;
export const DAILY_NEW_LIMIT_MAX = 100;

/** Lo que el usuario elige en el onboarding, ya validado. */
export interface OnboardingSelection {
  uiLocale: UiLocale;
  declaredLevel: CefrLevel;
  startLevel: CefrLevel;
  dailyNewLimit: number;
}

/**
 * Claves de error estables. Son identificadores para la capa de presentación
 * (LEX-2.8), no texto para el usuario: la traducción se resuelve con i18n.
 */
export type OnboardingIssue =
  | "onboarding.uiLocale.invalid"
  | "onboarding.declaredLevel.invalid"
  | "onboarding.startLevel.invalid"
  | "onboarding.dailyNewLimit.notInteger"
  | "onboarding.dailyNewLimit.outOfRange";

export type OnboardingValidation =
  { ok: true; value: OnboardingSelection } | { ok: false; issues: OnboardingIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Valida una selección de onboarding sin normalizar de más: acepta exactamente
 * los valores del enum y un entero dentro de rango, y devuelve **todas** las
 * pegas a la vez para que la pantalla pueda marcarlas juntas.
 */
export function validateOnboardingSelection(raw: unknown): OnboardingValidation {
  const input = isRecord(raw) ? raw : {};
  const issues: OnboardingIssue[] = [];

  const uiLocale = input["uiLocale"];
  if (typeof uiLocale !== "string" || !UI_LOCALES.includes(uiLocale as UiLocale)) {
    issues.push("onboarding.uiLocale.invalid");
  }

  const declaredLevel = input["declaredLevel"];
  if (typeof declaredLevel !== "string" || !CEFR_LEVELS.includes(declaredLevel as CefrLevel)) {
    issues.push("onboarding.declaredLevel.invalid");
  }

  const startLevel = input["startLevel"];
  if (typeof startLevel !== "string" || !CEFR_LEVELS.includes(startLevel as CefrLevel)) {
    issues.push("onboarding.startLevel.invalid");
  }

  const dailyNewLimit = input["dailyNewLimit"];
  if (typeof dailyNewLimit !== "number" || !Number.isInteger(dailyNewLimit)) {
    issues.push("onboarding.dailyNewLimit.notInteger");
  } else if (dailyNewLimit < DAILY_NEW_LIMIT_MIN || dailyNewLimit > DAILY_NEW_LIMIT_MAX) {
    issues.push("onboarding.dailyNewLimit.outOfRange");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      uiLocale: uiLocale as UiLocale,
      declaredLevel: declaredLevel as CefrLevel,
      startLevel: startLevel as CefrLevel,
      dailyNewLimit: dailyNewLimit as number,
    },
  };
}
