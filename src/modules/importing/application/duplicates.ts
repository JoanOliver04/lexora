/**
 * Plan de duplicados de importación (LEX-4.6).
 *
 * Reutiliza `canonicalKey` y `ConceptRepository.list` de la biblioteca
 * (LEX-3.10 / LEX-3.4): misma clave, mismos conceptos vivos del curso.
 * Una sola lectura del curso, clasificación en memoria — no un `find` por
 * fila (un archivo de 10.000 filas no debe disparar 10.000 consultas).
 *
 * No persiste nada. LEX-4.7 ejecutará `skip` / `copy`.
 */

import { type ConceptRepository } from "@/modules/library/application/concept";
import { canonicalKey } from "@/modules/library/domain/concept";

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

  const titlesByKey = new Map<string, string[]>();
  const existingKeys = new Set<string>();
  for (const concept of existing) {
    existingKeys.add(concept.canonicalKey);
    const titles = titlesByKey.get(concept.canonicalKey) ?? [];
    titles.push(concept.title);
    titlesByKey.set(concept.canonicalKey, titles);
  }

  const keyed = input.validRows.map((row) => ({
    rowNumber: row.rowNumber,
    key: canonicalKey(row.front),
    front: row.front,
  }));

  const classified = classifyImportRows(
    keyed.map(({ rowNumber, key }) => ({ rowNumber, key })),
    existingKeys,
  );

  const hits: DuplicateHit[] = [];
  for (const row of keyed) {
    if (!classified.isDuplicate.has(row.rowNumber)) continue;
    if (hits.length >= DUPLICATE_HIT_LIMIT) break;
    const fileRows = classified.fileRowsByKey.get(row.key) ?? [row.rowNumber];
    hits.push({
      rowNumber: row.rowNumber,
      front: row.front,
      existingTitles: (titlesByKey.get(row.key) ?? []).slice(0, EXISTING_TITLE_LIMIT),
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
