/**
 * Mapeo de columnas a frente / reverso / etiquetas (LEX-4.4).
 *
 * Lógica pura. `classifyRow` (LEX-4.2) asume «tres columnas, la de tags según
 * `#tags column:`, las otras dos en orden». La pantalla de vista previa deja
 * elegir a la persona qué columna es cada cosa, con más libertad: `front`,
 * `back` y `tags` son índices **0-indexados** independientes, y puede haber
 * más de tres columnas en el archivo (las que no se mapean se ignoran).
 *
 * No persiste nada: esto es lo que la pantalla usa para re-pintar la vista
 * previa cuando se cambia el mapeo. La validación y el saneamiento reales son
 * LEX-4.5.
 */

import type { ImportRowIssue, ParsedImportRow, RawImportRow } from "./row";

export interface ColumnMapping {
  /** Índice 0-indexado de la columna de frente. */
  front: number;
  /** Índice 0-indexado de la columna de reverso. */
  back: number;
  /** Índice 0-indexado de la columna de etiquetas, o `null` si no hay. */
  tags: number | null;
}

/** Por defecto: primera columna frente, segunda reverso, tercera etiquetas. */
export const DEFAULT_COLUMN_MAPPING: ColumnMapping = { front: 0, back: 1, tags: 2 };

export interface MappedRows {
  rows: ParsedImportRow[];
  issues: ImportRowIssue[];
}

/**
 * Aplica un mapeo a filas ya tokenizadas. Una fila cuyo índice mapeado más
 * alto no exista es `too_few_columns`; frente o reverso en blanco, su código.
 * Las etiquetas son opcionales: sin columna de tags, o con la columna ausente
 * en esa fila, la fila es válida sin etiquetas.
 */
export function applyColumnMapping(rawRows: RawImportRow[], mapping: ColumnMapping): MappedRows {
  const rows: ParsedImportRow[] = [];
  const issues: ImportRowIssue[] = [];

  const highestContentIndex = Math.max(mapping.front, mapping.back);

  for (const raw of rawRows) {
    if (raw.columns.length <= highestContentIndex) {
      issues.push({ rowNumber: raw.rowNumber, code: "too_few_columns" });
      continue;
    }

    const front = (raw.columns[mapping.front] ?? "").trim();
    const back = (raw.columns[mapping.back] ?? "").trim();

    if (front === "") {
      issues.push({ rowNumber: raw.rowNumber, code: "front_empty" });
      continue;
    }
    if (back === "") {
      issues.push({ rowNumber: raw.rowNumber, code: "back_empty" });
      continue;
    }

    const rawTags = mapping.tags === null ? "" : (raw.columns[mapping.tags] ?? "").trim();
    const tags = rawTags === "" ? [] : rawTags.split(/\s+/);

    rows.push({ rowNumber: raw.rowNumber, front, back, tags });
  }

  return { rows, issues };
}
