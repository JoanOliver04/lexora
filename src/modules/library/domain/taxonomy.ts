/**
 * Vocabulario cerrado de la biblioteca (LEX-3.1).
 *
 * Lógica pura: sin React, sin Next.js, sin base de datos, sin Zod. Estas
 * enumeraciones son la fuente en el dominio; el esquema de LEX-3.2 debe
 * reflejarlas con enums de PostgreSQL o CHECK equivalentes (MASTER_SPEC §§8,
 * 13.6–13.10).
 *
 * Los tipos no se importan de `courses/domain`: la organización es
 * *feature-first* (ADR-001, `src/modules/README.md`) y acoplar `library` a
 * `courses` por una unión de cuatro literales no compensa. `CefrLevel` se
 * repite a propósito; debe coincidir con `public.cefr_level` (LEX-2.1) y con el
 * `CefrLevel` de `courses`.
 */

/** Nivel del Marco Común Europeo. Coincide con `public.cefr_level`. */
export type CefrLevel = "A1" | "A2" | "B1" | "B2";
export const CEFR_LEVELS: readonly CefrLevel[] = ["A1", "A2", "B1", "B2"];

/**
 * Categoría de un mazo (MASTER_SPEC §9.5).
 *
 * `professional` es una **categoría**, no un nivel. §9.5 ofrece «profesional»
 * tanto en la lista de nivel como en la de categoría, pero §13.6 nombra la
 * columna `cefr_level`, que solo admite bandas MCER. Interpretación declarada
 * para LEX-3.2: el contenido profesional se clasifica con
 * `category = 'professional'` y `cefr_level` nulo. Confirmable por el
 * propietario.
 */
export type DeckCategory =
  "vocabulary" | "grammar" | "communicative_function" | "pronunciation" | "professional" | "mixed";
export const DECK_CATEGORIES: readonly DeckCategory[] = [
  "vocabulary",
  "grammar",
  "communicative_function",
  "pronunciation",
  "professional",
  "mixed",
];

/** Naturaleza de un concepto (MASTER_SPEC §13.7). */
export type ConceptKind =
  | "vocabulary"
  | "collocation"
  | "phrase"
  | "grammar"
  | "communicative_function"
  | "pronunciation"
  | "other";
export const CONCEPT_KINDS: readonly ConceptKind[] = [
  "vocabulary",
  "collocation",
  "phrase",
  "grammar",
  "communicative_function",
  "pronunciation",
  "other",
];

/**
 * Modos de un ítem de práctica (MASTER_SPEC §13.9). Los siete están reservados
 * en el dominio; solo los tres primeros pueden activarse en la V1 (§9.6). Un
 * modo futuro se modela pero se rechaza al validar un borrador.
 */
export type PracticeMode =
  | "basic_recognition"
  | "basic_recall"
  | "cloze"
  | "listening_dictation"
  | "guided_production"
  | "free_production"
  | "pronunciation";
export const PRACTICE_MODES: readonly PracticeMode[] = [
  "basic_recognition",
  "basic_recall",
  "cloze",
  "listening_dictation",
  "guided_production",
  "free_production",
  "pronunciation",
];

/** Subconjunto activable en la V1. */
export const V1_PRACTICE_MODES: readonly PracticeMode[] = [
  "basic_recognition",
  "basic_recall",
  "cloze",
];

export function isPracticeMode(value: unknown): value is PracticeMode {
  return typeof value === "string" && PRACTICE_MODES.includes(value as PracticeMode);
}

export function isV1PracticeMode(value: unknown): value is PracticeMode {
  return typeof value === "string" && V1_PRACTICE_MODES.includes(value as PracticeMode);
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/**
 * Longitudes máximas de campos de texto, en caracteres. El esquema de LEX-3.2
 * debe usar estos mismos límites (o mayores) en sus columnas; el guardián
 * último es la base de datos, esto solo permite un mensaje claro antes.
 */
export const TITLE_MAX_LENGTH = 200;
export const SHORT_TEXT_MAX_LENGTH = 500;
export const LONG_TEXT_MAX_LENGTH = 4000;

/**
 * Recorta los extremos y colapsa cualquier secuencia de espacios internos a uno
 * solo. No toca acentos ni mayúsculas: eso son decisiones de cada campo.
 */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isBlank(value: unknown): boolean {
  return typeof value !== "string" || normalizeWhitespace(value) === "";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Lee un campo de texto opcional: `undefined`/`null`/vacío → `null`. */
export function readOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Marca de «venía un valor, pero no es del vocabulario». Se distingue de `null`
 * (ausente, válido) para que el validador de cada entidad pueda emitir su pega.
 */
export const INVALID_ENUM = Symbol("invalid-enum");

/**
 * Lee un campo de enum **opcional**: ausente o vacío → `null`; presente y
 * dentro del vocabulario → el valor; presente y fuera → `INVALID_ENUM`. Una
 * sola implementación para nivel, categoría y cualquier otro enum cerrado.
 */
export function readOptionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | null | typeof INVALID_ENUM {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return allowed.includes(value as T) ? (value as T) : INVALID_ENUM;
}
