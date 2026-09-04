/**
 * Claves de dominio → claves de mensaje i18n, como en el onboarding y en
 * `decks/message-key.ts`. Dos uniones distintas usan esta ruta —`ConceptIssue`
 * y `TagIssue`— cada una con su propio prefijo y su propia región de error en
 * la pantalla, así que se mantienen como dos funciones.
 */

export function conceptIssueKey(issue: string): string {
  return issue.replace(/^concept\./, "").replace(/\./g, "_");
}

export function tagIssueKey(issue: string): string {
  return issue.replace(/^tag\./, "").replace(/\./g, "_");
}
