/**
 * Mazo (MASTER_SPEC §8.3, §9.5, §13.6).
 *
 * Agrupación organizativa de conceptos. **No posee el progreso**: solo
 * selecciona qué se quiere estudiar. Lógica pura (LEX-3.1): describe qué es un
 * borrador de mazo válido y lo valida. Crear, ordenar y archivar de verdad es
 * LEX-3.5.
 */

import {
  type CefrLevel,
  CEFR_LEVELS,
  type DeckCategory,
  DECK_CATEGORIES,
  INVALID_ENUM,
  isBlank,
  isRecord,
  normalizeWhitespace,
  readOptionalEnum,
  readOptionalText,
  SHORT_TEXT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "./taxonomy";

/** Mazo ya persistido. Los campos de identidad y tiempo los pone la base. */
export interface Deck {
  id: string;
  courseId: string;
  ownerId: string;
  title: string;
  description: string | null;
  cefrLevel: CefrLevel | null;
  category: DeckCategory | null;
  position: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lo que una persona edita de un mazo. `position` la asigna LEX-3.5. */
export interface DeckDraft {
  title: string;
  description: string | null;
  cefrLevel: CefrLevel | null;
  category: DeckCategory | null;
}

/**
 * Claves de error estables para la presentación (LEX-3.5), no texto para el
 * usuario: la traducción la resuelve i18n.
 */
export type DeckIssue =
  | "deck.title.empty"
  | "deck.title.tooLong"
  | "deck.description.tooLong"
  | "deck.cefrLevel.invalid"
  | "deck.category.invalid";

export type DeckValidation = { ok: true; value: DeckDraft } | { ok: false; issues: DeckIssue[] };

/**
 * Valida un borrador de mazo y devuelve **todas** las pegas a la vez. El nivel
 * y la categoría son opcionales (`null`); si vienen, deben ser valores del
 * vocabulario cerrado.
 */
export function validateDeckDraft(raw: unknown): DeckValidation {
  const input = isRecord(raw) ? raw : {};
  const issues: DeckIssue[] = [];

  const rawTitle = input["title"];
  if (isBlank(rawTitle)) {
    issues.push("deck.title.empty");
  } else if (normalizeWhitespace(rawTitle as string).length > TITLE_MAX_LENGTH) {
    issues.push("deck.title.tooLong");
  }

  const description = readOptionalText(input["description"]);
  if (description !== null && description.length > SHORT_TEXT_MAX_LENGTH) {
    issues.push("deck.description.tooLong");
  }

  const cefrLevel = readOptionalEnum(input["cefrLevel"], CEFR_LEVELS);
  if (cefrLevel === INVALID_ENUM) {
    issues.push("deck.cefrLevel.invalid");
  }

  const category = readOptionalEnum(input["category"], DECK_CATEGORIES);
  if (category === INVALID_ENUM) {
    issues.push("deck.category.invalid");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      title: normalizeWhitespace(rawTitle as string),
      description,
      cefrLevel: cefrLevel as CefrLevel | null,
      category: category as DeckCategory | null,
    },
  };
}

export function isArchived(deck: Pick<Deck, "archivedAt">): boolean {
  return deck.archivedAt !== null;
}
