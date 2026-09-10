/**
 * Mensajes seguros de error por fila (LEX-4.7, §16.3). Cortos, sin la fila,
 * sin consulta, sin secreto. El `code` es la clave; esto es lo que se guarda
 * en `import_job_errors.message`.
 */

import type { ImportPersistErrorCode } from "./import-job";

const ES: Record<ImportPersistErrorCode, string> = {
  too_few_columns: "La fila tiene menos columnas de las necesarias.",
  too_many_columns: "La fila tiene columnas de más.",
  front_empty: "El frente está en blanco.",
  back_empty: "El reverso está en blanco.",
  front_too_long: "El frente es demasiado largo para un concepto o ítem.",
  back_too_long: "El reverso es demasiado largo para un concepto o ítem.",
  tags_too_long: "El campo de etiquetas es demasiado largo.",
  rejected: "La fila no se pudo guardar como concepto o ítem.",
};

const EN: Record<ImportPersistErrorCode, string> = {
  too_few_columns: "The row has too few columns.",
  too_many_columns: "The row has too many columns.",
  front_empty: "The front is blank.",
  back_empty: "The back is blank.",
  front_too_long: "The front is too long for a concept or practice item.",
  back_too_long: "The back is too long for a concept or practice item.",
  tags_too_long: "The tags field is too long.",
  rejected: "The row could not be saved as a concept or practice item.",
};

export function importErrorMessage(code: ImportPersistErrorCode, locale: string): string {
  return (locale === "en" ? EN : ES)[code];
}
