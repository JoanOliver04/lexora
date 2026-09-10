/**
 * Vista previa de importación (LEX-4.4) y barreras de entrada (LEX-4.5).
 *
 * `mapPreviewRows` es la llamada que la pantalla hace cuando se cambia el
 * mapeo de columnas: reasigna las filas ya tokenizadas (`rawRows` del parser,
 * LEX-4.2) sin volver a leer el archivo. La lógica vive en el dominio
 * (`applyColumnMapping`); esto solo mantiene el borde de capas (la
 * presentación llama a `application/`, no a `domain/` directamente).
 *
 * `inspectImportUpload` es el corte **antes** de parsear: tamaño, filas,
 * archivo vacío. El nombre se sanea aquí para que la pantalla (y LEX-4.7)
 * nunca vean la ruta cruda del cliente.
 *
 * No persiste nada.
 */

import {
  type ColumnMapping,
  type MappedRows,
  applyColumnMapping,
} from "@/modules/importing/domain/column-mapping";
import { sanitizeFilename } from "@/modules/importing/domain/filename";
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  checkImportInput,
  exceedsFileSize,
} from "@/modules/importing/domain/limits";
import type { ImportRowIssue, RawImportRow } from "@/modules/importing/domain/row";
import { sanitizeRowSample } from "@/modules/importing/domain/sanitize";

export { MAX_FILE_BYTES, MAX_ROWS };

export type ImportFileError = "empty-file" | "too-large" | "too-many-rows";

export interface InspectedUpload {
  filename: string;
}

export function inspectImportUpload(input: {
  filename: string;
  byteSize: number;
  content: string;
}): ({ ok: true } & InspectedUpload) | ({ ok: false; error: ImportFileError } & InspectedUpload) {
  const filename = sanitizeFilename(input.filename);

  if (input.byteSize > MAX_FILE_BYTES || exceedsFileSize(input.content)) {
    return { ok: false, error: "too-large", filename };
  }
  if (input.content.trim() === "") {
    return { ok: false, error: "empty-file", filename };
  }

  const checked = checkImportInput(input.content);
  if (!checked.ok) {
    return { ok: false, error: checked.code, filename };
  }

  return { ok: true, filename };
}

export function mapPreviewRows(rawRows: RawImportRow[], mapping: ColumnMapping): MappedRows {
  return applyColumnMapping(rawRows, mapping);
}

/** Muestra segura de una fila de la vista previa (§16.3). */
export function previewRowSample(columns: string[]): string {
  return sanitizeRowSample(columns.join(" | "));
}

export function issuesWithSamples(
  issues: ImportRowIssue[],
  rawRows: RawImportRow[],
): { rowNumber: number; code: ImportRowIssue["code"]; sample: string }[] {
  const columnsByRow = new Map(rawRows.map((raw) => [raw.rowNumber, raw.columns]));
  return issues.map((issue) => ({
    rowNumber: issue.rowNumber,
    code: issue.code,
    sample: previewRowSample(columnsByRow.get(issue.rowNumber) ?? []),
  }));
}
