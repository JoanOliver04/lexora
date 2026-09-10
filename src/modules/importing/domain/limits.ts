/**
 * Límites de un archivo de importación (LEX-4.5, MASTER_SPEC §16.2–16.3).
 *
 * Lógica pura. Estos topes se comprueban **antes** de parsear: un archivo que
 * los pase se rechaza sin llegar a Papa Parse, para no cargar en memoria algo
 * que agotaría la Server Action. §9.7: «5 MB y 10.000 filas por archivo,
 * ajustables tras pruebas».
 *
 * Los límites de longitud de campo son propios del import y **deliberadamente
 * independientes** de `library/domain/taxonomy.ts` (feature-first, ADR-001):
 * los topes más estrictos de cada entidad —título de concepto 200, etc.— se
 * aplican cuando LEX-4.7 crea las entidades, con sus propios mensajes de
 * dominio. Aquí solo se acota lo bastante para que un campo enorme no pase.
 */

/** Tamaño máximo del contenido, en bytes UTF-8. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Nº máximo de filas de datos. El guardián previo cuenta saltos de línea. */
export const MAX_ROWS = 10_000;

/** Longitud máxima de frente y de reverso, en caracteres. */
export const MAX_FIELD_LENGTH = 4000;

/** Longitud máxima del campo de etiquetas entero, en caracteres. */
export const MAX_TAGS_FIELD_LENGTH = 2000;

/** Longitud máxima de `import_jobs.original_filename` (coincide con el CHECK). */
export const MAX_FILENAME_LENGTH = 255;

/**
 * Longitud máxima de una `row_sample` expuesta. El CHECK de la columna admite
 * 500; aquí se recorta antes, a 200 (§16.3).
 */
export const MAX_ROW_SAMPLE_LENGTH = 200;

export type ImportInputRejection = "too-large" | "too-many-rows";

/** `true` si el contenido pasa de `MAX_FILE_BYTES` bytes UTF-8. */
export function exceedsFileSize(content: string): boolean {
  return new TextEncoder().encode(content).length > MAX_FILE_BYTES;
}

/**
 * `true` si el contenido tiene claramente más de `MAX_ROWS` filas. Cuenta
 * saltos de línea, que es un techo barato (incluye las líneas directivas y no
 * distingue campos entrecomillados multilínea) — a propósito: es un corte
 * temprano, no el recuento exacto.
 */
export function exceedsRowCount(content: string): boolean {
  const lineBreaks = content.match(/\r\n|\n/g)?.length ?? 0;
  return lineBreaks > MAX_ROWS;
}

/**
 * Comprueba tamaño y filas antes de parsear. `too-large` antes que
 * `too-many-rows` (el tamaño es más barato de comprobar y más determinante).
 */
export function checkImportInput(
  content: string,
): { ok: true } | { ok: false; code: ImportInputRejection } {
  if (exceedsFileSize(content)) {
    return { ok: false, code: "too-large" };
  }
  if (exceedsRowCount(content)) {
    return { ok: false, code: "too-many-rows" };
  }
  return { ok: true };
}
