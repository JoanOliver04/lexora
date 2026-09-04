/**
 * Clave de dominio → clave de mensaje i18n, como en el onboarding.
 *
 * `validateDeckDraft` (LEX-3.1) devuelve claves como `deck.title.empty`.
 * next-intl interpreta el punto como anidamiento, así que los mensajes viven
 * planos bajo `Library.errors` con `_`: `title_empty`. Un test comprueba que
 * toda clave de `DeckIssue` tiene mensaje en `es` y en `en`.
 */
export function deckIssueKey(issue: string): string {
  return issue.replace(/^deck\./, "").replace(/\./g, "_");
}
