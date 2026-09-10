/**
 * Plan de duplicados de una importación (LEX-4.6, MASTER_SPEC §9.7).
 *
 * Lógica pura. Una fila válida es **nueva** o **posible duplicada**. La
 * coincidencia es la misma `canonical_key` que usa la biblioteca (LEX-3.10):
 * minúsculas, espacios colapsados, acentos conservados. Quien calcula la clave
 * es la capa de aplicación, para no acoplar este dominio al módulo `library`.
 *
 * Estrategias que la persona elige, nunca una omisión destructiva:
 * `skip` (no crear la fila duplicada) y `copy` (crear otro concepto
 * independiente). Actualizar un concepto existente queda fuera: no hay un
 * criterio seguro de «es el mismo, solo cambia un campo» que no arriesgue
 * historial de estudio. LEX-4.7 ejecutará la estrategia; aquí solo se
 * clasifica y se recuerda la elección.
 */

export const DUPLICATE_STRATEGIES = ["skip", "copy"] as const;
export type DuplicateStrategy = (typeof DUPLICATE_STRATEGIES)[number];
export const DEFAULT_DUPLICATE_STRATEGY: DuplicateStrategy = "skip";

/** Tope de filas duplicadas que se detallan en la vista previa. */
export const DUPLICATE_HIT_LIMIT = 20;

export interface ImportRowKey {
  rowNumber: number;
  key: string;
}

export interface ClassifiedImportRows {
  newCount: number;
  duplicateCount: number;
  /** Primera aparición de cada clave duplicada, en orden de archivo. */
  duplicateKeys: string[];
  /** Otras filas del archivo con la misma clave, por clave. */
  fileRowsByKey: ReadonlyMap<string, number[]>;
  /** `true` si esa fila (por número) es una posible duplicada. */
  isDuplicate: ReadonlySet<number>;
}

/**
 * Clasifica filas válidas ya claveadas. Una fila es duplicada si su clave
 * ya existe en el curso **o** ya apareció antes en este archivo. La primera
 * aparición de una clave nueva cuenta como nueva.
 */
export function classifyImportRows(
  rows: ImportRowKey[],
  existingKeys: ReadonlySet<string>,
): ClassifiedImportRows {
  const seenInFile = new Set<string>();
  const isDuplicate = new Set<number>();
  const duplicateKeys: string[] = [];
  const fileRowsByKey = new Map<string, number[]>();
  let newCount = 0;
  let duplicateCount = 0;

  for (const row of rows) {
    const group = fileRowsByKey.get(row.key) ?? [];
    group.push(row.rowNumber);
    fileRowsByKey.set(row.key, group);
  }

  for (const row of rows) {
    const duplicate = existingKeys.has(row.key) || seenInFile.has(row.key);
    if (duplicate) {
      duplicateCount += 1;
      isDuplicate.add(row.rowNumber);
      if (!duplicateKeys.includes(row.key)) {
        duplicateKeys.push(row.key);
      }
    } else {
      newCount += 1;
    }
    seenInFile.add(row.key);
  }

  return { newCount, duplicateCount, duplicateKeys, fileRowsByKey, isDuplicate };
}

export function parseDuplicateStrategy(raw: unknown): DuplicateStrategy {
  return raw === "copy" ? "copy" : DEFAULT_DUPLICATE_STRATEGY;
}

export function isDuplicateStrategy(value: unknown): value is DuplicateStrategy {
  return value === "skip" || value === "copy";
}
