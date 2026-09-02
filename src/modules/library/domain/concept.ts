/**
 * Concepto (MASTER_SPEC §8.4, §9.6, §13.7).
 *
 * Unidad de conocimiento que la persona quiere aprender: palabra, collocation,
 * expresión, regla, función comunicativa o contraste de pronunciación. Un
 * concepto puede estar en varios mazos sin duplicar su progreso. Lógica pura
 * (LEX-3.1). El CRUD real es LEX-3.6; la sugerencia de duplicados por
 * `canonicalKey`, LEX-3.10.
 */

import {
  type CefrLevel,
  CEFR_LEVELS,
  type ConceptKind,
  CONCEPT_KINDS,
  INVALID_ENUM,
  isBlank,
  isRecord,
  LONG_TEXT_MAX_LENGTH,
  normalizeWhitespace,
  readOptionalEnum,
  readOptionalText,
  SHORT_TEXT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
} from "./taxonomy";

/** Concepto ya persistido. */
export interface Concept {
  id: string;
  courseId: string;
  ownerId: string;
  kind: ConceptKind;
  title: string;
  canonicalKey: string;
  summary: string;
  explanation: string | null;
  example: string | null;
  cefrLevel: CefrLevel | null;
  sourceReference: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Lo que una persona edita de un concepto. `canonicalKey` se deriva del título. */
export interface ConceptDraft {
  kind: ConceptKind;
  title: string;
  summary: string;
  explanation: string | null;
  example: string | null;
  cefrLevel: CefrLevel | null;
  sourceReference: string | null;
}

export type ConceptIssue =
  | "concept.kind.invalid"
  | "concept.title.empty"
  | "concept.title.tooLong"
  | "concept.summary.empty"
  | "concept.summary.tooLong"
  | "concept.explanation.tooLong"
  | "concept.example.tooLong"
  | "concept.cefrLevel.invalid";

export type ConceptValidation =
  { ok: true; value: ConceptDraft } | { ok: false; issues: ConceptIssue[] };

/**
 * Clave canónica para **sugerir** posibles duplicados (§13.7), nunca para
 * fusionarlos: dos entradas iguales pueden tener matices distintos. La
 * normalización es deliberadamente conservadora —minúsculas, extremos
 * recortados, espacios internos colapsados— y **no quita acentos**: el idioma
 * de apoyo es español y `canonical_key` chocaría en contenido real si se
 * plegara `é`→`e`. Cuánto se afloja la coincidencia es cosa de LEX-3.10.
 */
export function canonicalKey(title: string): string {
  return normalizeWhitespace(title).toLowerCase();
}

/**
 * Valida un borrador de concepto y devuelve **todas** las pegas a la vez.
 * `title` y `summary` son obligatorios; el resto es opcional (`null`).
 */
export function validateConceptDraft(raw: unknown): ConceptValidation {
  const input = isRecord(raw) ? raw : {};
  const issues: ConceptIssue[] = [];

  const kind = input["kind"];
  if (typeof kind !== "string" || !CONCEPT_KINDS.includes(kind as ConceptKind)) {
    issues.push("concept.kind.invalid");
  }

  const rawTitle = input["title"];
  if (isBlank(rawTitle)) {
    issues.push("concept.title.empty");
  } else if (normalizeWhitespace(rawTitle as string).length > TITLE_MAX_LENGTH) {
    issues.push("concept.title.tooLong");
  }

  const rawSummary = input["summary"];
  if (isBlank(rawSummary)) {
    issues.push("concept.summary.empty");
  } else if (normalizeWhitespace(rawSummary as string).length > SHORT_TEXT_MAX_LENGTH) {
    issues.push("concept.summary.tooLong");
  }

  const explanation = readOptionalText(input["explanation"]);
  if (explanation !== null && explanation.length > LONG_TEXT_MAX_LENGTH) {
    issues.push("concept.explanation.tooLong");
  }

  const example = readOptionalText(input["example"]);
  if (example !== null && example.length > SHORT_TEXT_MAX_LENGTH) {
    issues.push("concept.example.tooLong");
  }

  const cefrLevel = readOptionalEnum(input["cefrLevel"], CEFR_LEVELS);
  if (cefrLevel === INVALID_ENUM) {
    issues.push("concept.cefrLevel.invalid");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: {
      kind: kind as ConceptKind,
      title: normalizeWhitespace(rawTitle as string),
      summary: normalizeWhitespace(rawSummary as string),
      explanation,
      example,
      cefrLevel: cefrLevel as CefrLevel | null,
      sourceReference: readOptionalText(input["sourceReference"]),
    },
  };
}

export function isArchived(concept: Pick<Concept, "archivedAt">): boolean {
  return concept.archivedAt !== null;
}
