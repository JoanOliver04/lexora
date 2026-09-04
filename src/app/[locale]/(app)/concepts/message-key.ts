/**
 * Claves de dominio → claves de mensaje i18n, como en el onboarding y en
 * `decks/message-key.ts`. Tres uniones distintas usan esta ruta —`ConceptIssue`,
 * `TagIssue` y `PracticeItemIssue`— cada una con su propio prefijo y su propia
 * región de error en la pantalla, así que se mantienen como tres funciones.
 */

export function conceptIssueKey(issue: string): string {
  return issue.replace(/^concept\./, "").replace(/\./g, "_");
}

export function tagIssueKey(issue: string): string {
  return issue.replace(/^tag\./, "").replace(/\./g, "_");
}

export function practiceItemIssueKey(issue: string): string {
  return issue.replace(/^practiceItem\./, "").replace(/\./g, "_");
}
