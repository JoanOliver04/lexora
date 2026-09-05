/**
 * Clasificación de una fila ya tokenizada (LEX-4.2).
 *
 * Lógica pura: recibe las columnas **ya separadas** por el adaptador (Papa
 * Parse hace el trabajo de respetar comillas y separadores dentro de un
 * campo) y decide si son una fila válida o un problema con código. No lanza:
 * un archivo con una fila mala no debe abortar las buenas.
 *
 * El saneamiento real (longitudes, HTML no ejecutable, límites) es LEX-4.5;
 * aquí solo se detecta la forma: columnas de más/de menos, frente o reverso
 * en blanco.
 */

/** Tres columnas: frente, reverso, etiquetas (§9.7). */
export const EXPECTED_COLUMNS = 3;

export type ImportRowIssueCode =
  "too_few_columns" | "too_many_columns" | "front_empty" | "back_empty";

export interface ImportRowIssue {
  /** Número de línea 1-indexado tal como se ve en el archivo. */
  rowNumber: number;
  code: ImportRowIssueCode;
}

export interface ParsedImportRow {
  rowNumber: number;
  front: string;
  back: string;
  tags: string[];
}

/**
 * Una fila ya tokenizada pero **sin clasificar**: las columnas tal cual, con
 * su número de línea. La pantalla de mapeo (LEX-4.4) la necesita para
 * reasignar qué columna es frente/reverso/tags sin volver a leer el archivo.
 */
export interface RawImportRow {
  rowNumber: number;
  columns: string[];
}

export function isImportRowIssue(
  result: ParsedImportRow | ImportRowIssue,
): result is ImportRowIssue {
  return "code" in result;
}

/**
 * `tagsColumn` es 1-indexada. Las otras dos columnas, en su orden de
 * izquierda a derecha, son frente y reverso. Varias etiquetas en el campo se
 * separan por espacios (convención de Anki); la jerarquía `::` se conserva
 * tal cual —coincide con `normalizeTagName`/`tagSegments` del dominio de
 * biblioteca (LEX-3.1)—.
 */
export function classifyRow(
  columns: string[],
  rowNumber: number,
  tagsColumn: number,
): ParsedImportRow | ImportRowIssue {
  if (columns.length < EXPECTED_COLUMNS) {
    return { rowNumber, code: "too_few_columns" };
  }
  if (columns.length > EXPECTED_COLUMNS) {
    return { rowNumber, code: "too_many_columns" };
  }

  const tagsIndex = Math.min(Math.max(tagsColumn, 1), EXPECTED_COLUMNS) - 1;
  const contentIndexes = [0, 1, 2].filter((index) => index !== tagsIndex);

  const front = (columns[contentIndexes[0]!] ?? "").trim();
  const back = (columns[contentIndexes[1]!] ?? "").trim();
  const rawTags = (columns[tagsIndex] ?? "").trim();

  if (front === "") {
    return { rowNumber, code: "front_empty" };
  }
  if (back === "") {
    return { rowNumber, code: "back_empty" };
  }

  const tags = rawTags === "" ? [] : rawTags.split(/\s+/);
  return { rowNumber, front, back, tags };
}
