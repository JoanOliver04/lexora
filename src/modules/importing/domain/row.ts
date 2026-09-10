/**
 * Clasificación de una fila ya tokenizada (LEX-4.2, validación LEX-4.5).
 *
 * Lógica pura: recibe las columnas **ya separadas** por el adaptador (Papa
 * Parse hace el trabajo de respetar comillas y separadores dentro de un
 * campo) y decide si son una fila válida o un problema con código. No lanza:
 * un archivo con una fila mala no debe abortar las buenas.
 *
 * Orden: forma (columnas de más/de menos) → HTML a texto plano → recorte de
 * extremos → frente/reverso en blanco → longitud de campo. El HTML se quita
 * antes de validar para juzgar lo que se guardaría, no el marcado.
 */

import { MAX_FIELD_LENGTH, MAX_TAGS_FIELD_LENGTH } from "./limits";
import { stripImportedHtml } from "./sanitize";

/** Tres columnas: frente, reverso, etiquetas (§9.7). */
export const EXPECTED_COLUMNS = 3;

export const IMPORT_ROW_ISSUE_CODES = [
  "too_few_columns",
  "too_many_columns",
  "front_empty",
  "back_empty",
  "front_too_long",
  "back_too_long",
  "tags_too_long",
] as const;

export type ImportRowIssueCode = (typeof IMPORT_ROW_ISSUE_CODES)[number];

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

  return classifyFields(
    columns[contentIndexes[0]!] ?? "",
    columns[contentIndexes[1]!] ?? "",
    columns[tagsIndex] ?? "",
    rowNumber,
  );
}

/**
 * Sanea y valida frente / reverso / etiquetas ya extraídos. Compartido por
 * `classifyRow` (parser, tres columnas fijas) y `applyColumnMapping` (mapeo
 * libre de la vista previa).
 */
export function classifyFields(
  front: string,
  back: string,
  rawTags: string,
  rowNumber: number,
): ParsedImportRow | ImportRowIssue {
  const strippedFront = stripImportedHtml(front).trim();
  const strippedBack = stripImportedHtml(back).trim();
  const strippedTags = stripImportedHtml(rawTags).trim();

  if (strippedFront === "") {
    return { rowNumber, code: "front_empty" };
  }
  if (strippedBack === "") {
    return { rowNumber, code: "back_empty" };
  }
  if (strippedFront.length > MAX_FIELD_LENGTH) {
    return { rowNumber, code: "front_too_long" };
  }
  if (strippedBack.length > MAX_FIELD_LENGTH) {
    return { rowNumber, code: "back_too_long" };
  }
  if (strippedTags.length > MAX_TAGS_FIELD_LENGTH) {
    return { rowNumber, code: "tags_too_long" };
  }

  const tags = strippedTags === "" ? [] : strippedTags.split(/\s+/);
  return { rowNumber, front: strippedFront, back: strippedBack, tags };
}
