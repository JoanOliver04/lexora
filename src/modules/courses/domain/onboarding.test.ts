import { describe, expect, it } from "vitest";

import {
  CEFR_LEVELS,
  DAILY_NEW_LIMIT_MAX,
  DAILY_NEW_LIMIT_MIN,
  DEFAULT_START_LEVEL,
  REFERENCE_COURSE,
  RECOMMENDED_DAILY_NEW_LIMIT,
  UI_LOCALES,
  validateOnboardingSelection,
} from "./onboarding";

const valid = {
  uiLocale: "es",
  declaredLevel: "B1",
  startLevel: "A1",
  dailyNewLimit: 5,
} as const;

describe("validateOnboardingSelection", () => {
  it("acepta una selección dentro de todos los rangos", () => {
    const result = validateOnboardingSelection(valid);
    expect(result).toEqual({ ok: true, value: { ...valid } });
  });

  it("acepta cada locale de interfaz y cada nivel CEFR permitidos", () => {
    for (const uiLocale of UI_LOCALES) {
      for (const level of CEFR_LEVELS) {
        const result = validateOnboardingSelection({
          uiLocale,
          declaredLevel: level,
          startLevel: level,
          dailyNewLimit: RECOMMENDED_DAILY_NEW_LIMIT,
        });
        expect(result.ok).toBe(true);
      }
    }
  });

  it("acepta los dos extremos del rango de límite diario", () => {
    for (const dailyNewLimit of [DAILY_NEW_LIMIT_MIN, DAILY_NEW_LIMIT_MAX]) {
      expect(validateOnboardingSelection({ ...valid, dailyNewLimit }).ok).toBe(true);
    }
  });

  it("rechaza un idioma de interfaz que no está en el enum", () => {
    const result = validateOnboardingSelection({ ...valid, uiLocale: "fr" });
    expect(result).toEqual({ ok: false, issues: ["onboarding.uiLocale.invalid"] });
  });

  it("rechaza un nivel declarado desconocido", () => {
    const result = validateOnboardingSelection({ ...valid, declaredLevel: "C1" });
    expect(result).toEqual({ ok: false, issues: ["onboarding.declaredLevel.invalid"] });
  });

  it("rechaza un nivel inicial desconocido", () => {
    const result = validateOnboardingSelection({ ...valid, startLevel: "" });
    expect(result).toEqual({ ok: false, issues: ["onboarding.startLevel.invalid"] });
  });

  it("rechaza un límite diario no entero", () => {
    const result = validateOnboardingSelection({ ...valid, dailyNewLimit: 5.5 });
    expect(result).toEqual({ ok: false, issues: ["onboarding.dailyNewLimit.notInteger"] });
  });

  it("rechaza un límite diario por encima del máximo", () => {
    const result = validateOnboardingSelection({
      ...valid,
      dailyNewLimit: DAILY_NEW_LIMIT_MAX + 1,
    });
    expect(result).toEqual({ ok: false, issues: ["onboarding.dailyNewLimit.outOfRange"] });
  });

  it("rechaza un límite diario negativo", () => {
    const result = validateOnboardingSelection({ ...valid, dailyNewLimit: -1 });
    expect(result).toEqual({ ok: false, issues: ["onboarding.dailyNewLimit.outOfRange"] });
  });

  it("acumula todas las pegas de una entrada entera inválida", () => {
    const result = validateOnboardingSelection({
      uiLocale: "de",
      declaredLevel: "Z9",
      startLevel: 3,
      dailyNewLimit: "cinco",
    });
    expect(result).toEqual({
      ok: false,
      issues: [
        "onboarding.uiLocale.invalid",
        "onboarding.declaredLevel.invalid",
        "onboarding.startLevel.invalid",
        "onboarding.dailyNewLimit.notInteger",
      ],
    });
  });

  it("trata una entrada que no es un objeto como selección vacía", () => {
    for (const raw of [null, undefined, "x", 42, []]) {
      const result = validateOnboardingSelection(raw);
      expect(result.ok).toBe(false);
    }
  });
});

describe("constantes del curso de referencia", () => {
  it("fija apoyo español, objetivo inglés y variante en-GB", () => {
    expect(REFERENCE_COURSE).toEqual({
      supportLanguage: { code: "es", locale: "es" },
      targetLanguage: { code: "en", locale: "en" },
      targetLocale: "en-GB",
    });
  });

  it("recomienda A1 como nivel de inicio y 5 ítems nuevos al día", () => {
    expect(DEFAULT_START_LEVEL).toBe("A1");
    expect(RECOMMENDED_DAILY_NEW_LIMIT).toBe(5);
  });
});
