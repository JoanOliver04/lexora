import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { deckIssueKey } from "@/app/[locale]/(app)/decks/message-key";
import type { DeckIssue } from "@/modules/library/domain/deck";

/**
 * El puente entre `validateDeckDraft` (dominio) y las traducciones es
 * `deckIssueKey`. Si el dominio añade una `DeckIssue` y nadie pone su mensaje,
 * la pantalla renderizaría una clave cruda. Este test lo impide: cada clave de
 * error tiene mensaje en los dos idiomas.
 *
 * La lista se mantiene a mano: es exactamente la unión `DeckIssue`, y
 * `satisfies` obliga a que no se desvíe.
 */
const ISSUES = [
  "deck.title.empty",
  "deck.title.tooLong",
  "deck.description.tooLong",
  "deck.cefrLevel.invalid",
  "deck.category.invalid",
] as const satisfies readonly DeckIssue[];

describe("claves de error de mazos", () => {
  it("transforma la clave de dominio a la clave plana de i18n", () => {
    expect(deckIssueKey("deck.title.empty")).toBe("title_empty");
    expect(deckIssueKey("deck.cefrLevel.invalid")).toBe("cefrLevel_invalid");
  });

  it("cada DeckIssue tiene mensaje en es y en en", () => {
    for (const issue of ISSUES) {
      const key = deckIssueKey(issue);
      expect(es.Library.errors, `es: falta ${key}`).toHaveProperty(key);
      expect(en.Library.errors, `en: falta ${key}`).toHaveProperty(key);
    }
  });
});
