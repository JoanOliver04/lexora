import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { issueMessageKey } from "@/app/[locale]/(app)/onboarding/message-key";
import type { OnboardingIssue } from "@/modules/courses/domain/onboarding";

/**
 * El puente entre `validateOnboardingSelection` (dominio) y las traducciones es
 * `issueMessageKey`. Si el dominio añade una `OnboardingIssue` y nadie pone su
 * mensaje, la pantalla renderizaría una clave cruda. Este test lo impide: cada
 * clave de error tiene mensaje en los dos idiomas.
 *
 * La lista se mantiene a mano a propósito: es exactamente la unión
 * `OnboardingIssue`, y `satisfies` obliga a que no se desvíe.
 */
const ISSUES = [
  "onboarding.uiLocale.invalid",
  "onboarding.declaredLevel.invalid",
  "onboarding.startLevel.invalid",
  "onboarding.dailyNewLimit.notInteger",
  "onboarding.dailyNewLimit.outOfRange",
] as const satisfies readonly OnboardingIssue[];

describe("claves de error del onboarding", () => {
  it("transforma la clave de dominio a la clave plana de i18n", () => {
    expect(issueMessageKey("onboarding.dailyNewLimit.outOfRange")).toBe("dailyNewLimit_outOfRange");
    expect(issueMessageKey("onboarding.uiLocale.invalid")).toBe("uiLocale_invalid");
  });

  it("cada OnboardingIssue tiene mensaje en es y en en", () => {
    for (const issue of ISSUES) {
      const key = issueMessageKey(issue);
      expect(es.Onboarding.errors, `es: falta ${key}`).toHaveProperty(key);
      expect(en.Onboarding.errors, `en: falta ${key}`).toHaveProperty(key);
    }
  });
});
