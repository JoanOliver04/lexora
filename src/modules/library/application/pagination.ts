/**
 * Utilidades de paginación compartidas por los casos de uso de búsqueda de la
 * biblioteca (LEX-3.9).
 *
 * Sin dependencia de framework, igual que el resto de `application/`: valida
 * `limit`/`offset` de forma defensiva, en el mismo espíritu que `assertUserId`
 * en cada fichero de casos de uso — quien llama nunca es de fiar del todo,
 * aunque ya haya pasado por una Server Action.
 */

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Ausente, no finito o no positivo → tamaño por defecto. Techo: `MAX_PAGE_SIZE`. */
export function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}

/** Ausente, no finito o negativo → `0`. */
export function clampOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset) || offset < 0) return 0;
  return Math.trunc(offset);
}

/** Resultado de una búsqueda paginada: la página pedida y el total sin paginar. */
export interface PageResult<T> {
  items: T[];
  total: number;
}
