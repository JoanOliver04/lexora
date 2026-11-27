/**
 * Plan de duplicados de importación (LEX-4.6).
 *
 * Compara el vocabulario con la clave del editor EOI y conserva la coincidencia
 * exacta para los demás conceptos vivos.
 * Una sola lectura del curso, clasificación en memoria — no un `find` por
 * fila (un archivo de 10.000 filas no debe disparar 10.000 consultas).
 *
 * No persiste nada. LEX-4.7 ejecutará `skip` / `copy`.
 */

import { type ConceptRepository } from "@/modules/library/application/concept";
import { vocabularyKey } from "@/modules/library/domain/eoi";
import { canonicalKey, type Concept } from "@/modules/library/domain/concept";

import {
  DUPLICATE_HIT_LIMIT,
  type DuplicateStrategy,
  classifyImportRows,
} from "@/modules/importing/domain/duplicates";
import type { ParsedImportRow } from "@/modules/importing/domain/row";

export interface DuplicateHit {
  rowNumber: number;
  front: string;
  /** Títulos de conceptos vivos del curso con la misma clave, acotados. */
  existingTitles: string[];
  /** Otras filas del archivo con la misma clave. */
  otherFileRows: number[];
}

export interface ImportDuplicatePlan {
  strategy: DuplicateStrategy;
  newCount: number;
  duplicateCount: number;
  invalidCount: number;
  hits: DuplicateHit[];
}

const EXISTING_TITLE_LIMIT = 3;

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de importación invocado sin identificador de usuario");
  }
}

/**
 * Clasifica las filas válidas ya mapeadas contra los conceptos vivos del
 * curso. `invalidCount` se copia tal cual (vienen de LEX-4.2/4.5).
 */
export async function planImportDuplicates(input: {
  ownerId: string;
  courseId: string;
  validRows: ParsedImportRow[];
  invalidCount: number;
  strategy: DuplicateStrategy;
  concepts: Pick<ConceptRepository, "list">;
}): Promise<ImportDuplicatePlan> {
  assertUserId(input.ownerId);

  const existing = await input.concepts.list({
    ownerId: input.ownerId,
    courseId: input.courseId,
  });

  const { keyed, classified } = classifyVocabularyImport(input.validRows, existing);

  const hits: DuplicateHit[] = [];
  for (const row of keyed) {
    if (!classified.isDuplicate.has(row.rowNumber)) continue;
    if (hits.length >= DUPLICATE_HIT_LIMIT) break;
    const fileRows = classified.fileRowsByKey.get(row.key) ?? [row.rowNumber];
    hits.push({
      rowNumber: row.rowNumber,
      front: row.front,
      existingTitles: row.existingTitles.slice(0, EXISTING_TITLE_LIMIT),
      otherFileRows: fileRows.filter((number) => number !== row.rowNumber),
    });
  }

  return {
    strategy: input.strategy,
    newCount: classified.newCount,
    duplicateCount: classified.duplicateCount,
    invalidCount: input.invalidCount,
    hits,
  };
}

// The classic importer creates vocabulary rows. An exact front still counts
// against other concept kinds, whose slash-delimited text can be meaningful.
export function classifyVocabularyImport(
  rows: Pick<ParsedImportRow, "rowNumber" | "front">[],
  concepts: Pick<Concept, "kind" | "title" | "canonicalKey">[],
) {
  const vocabulary = new Map<string, string[]>();
  const other = new Map<string, string[]>();
  for (const concept of concepts) {
    const isWord = concept.kind === "vocabulary";
    const index = isWord ? vocabulary : other;
    const key = isWord ? vocabularyKey(concept.title) : concept.canonicalKey;
    const titles = index.get(key) ?? [];
    if (titles.length < EXISTING_TITLE_LIMIT) titles.push(concept.title);
    index.set(key, titles);
  }
  const keyed = rows.map(({ rowNumber, front }) => {
    const key = vocabularyKey(front);
    const exact = other.get(canonicalKey(front)) ?? [];
    return {
      rowNumber,
      front,
      key,
      exactMatch: exact.length > 0,
      existingTitles: [...(vocabulary.get(key) ?? []), ...exact],
    };
  });
  return { keyed, classified: classifyImportRows(keyed, new Set(vocabulary.keys())) };
}
