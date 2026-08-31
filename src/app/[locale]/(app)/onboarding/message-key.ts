/**
 * Clave de dominio → clave de mensaje i18n.
 *
 * `validateOnboardingSelection` devuelve claves como
 * `onboarding.dailyNewLimit.outOfRange`. next-intl interpreta el punto como
 * anidamiento, así que los mensajes se guardan planos bajo `Onboarding.errors`
 * con `_`: `dailyNewLimit_outOfRange`. Esta función hace la traducción, y un
 * test comprueba que toda clave de `OnboardingIssue` tiene mensaje en `es` y
 * en `en`.
 */
export function issueMessageKey(issue: string): string {
  return issue.replace(/^onboarding\./, "").replace(/\./g, "_");
}
