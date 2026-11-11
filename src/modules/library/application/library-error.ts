/**
 * Error interno de la capa de aplicación de `library`, ya traducido desde el
 * error del cliente de base de datos (LEX-3.4).
 *
 * La capa de aplicación no deja escapar códigos de PostgREST ni objetos del
 * cliente de Supabase: los adaptadores los traducen a uno de estos `kind`, que
 * es lo único sobre lo que la presentación (LEX-3.5+) decide qué mensaje
 * mostrar y si reintentar.
 */

export type LibraryErrorKind =
  /** Choca con una restricción de unicidad —hoy solo `tags (course_id, normalized_name)`, LEX-3.3—. El usuario reescribe; no es un fallo. */
  | "duplicate"
  /**
   * Una clave foránea compuesta rechazó la fila: el mazo, concepto o etiqueta
   * al que se apunta no existe, o no es del usuario. Desde el cliente los dos
   * casos son indistinguibles (la FK compuesta lleva `owner_id`), así que se
   * unifican aquí.
   */
  | "parent-missing"
  /** Una lectura por id no encontró la fila (o RLS la ocultó). */
  | "not-found"
  /**
   * RLS rechazó la escritura (`42501`). No debería ocurrir: el caso de uso
   * comprueba la pertenencia antes. Si llega, es un error de programación, no
   * del usuario.
   */
  | "forbidden"
  /** Cualquier otro fallo de infraestructura. */
  | "unavailable";

export class LibraryError extends Error {
  readonly kind: LibraryErrorKind;

  constructor(kind: LibraryErrorKind, message: string) {
    super(message);
    this.name = "LibraryError";
    this.kind = kind;
  }
}

/**
 * Traduce el `code` de un error de PostgREST/Postgres al `kind` interno.
 * Centralizado para que los cuatro adaptadores lo hagan igual.
 *
 * - `23505` unique_violation      → `duplicate`
 * - `23503` foreign_key_violation → `parent-missing`
 * - `42501` insufficient_privilege→ `forbidden`
 * - `PGRST116` (0 filas en `single`) → `not-found`
 * - resto                          → `unavailable`
 */
export function libraryErrorFrom(
  error: { code?: string | null; message?: string } | null | undefined,
  context: string,
): LibraryError {
  // Postgres details/hint/message can contain the rejected private row. Never
  // retain the provider object as Error.cause, including on uncaught paths.
  const suppliedCode = error?.code ?? "";
  const code = /^[A-Z0-9]{5,10}$/.test(suppliedCode) ? suppliedCode : "";
  const detail = `${context} (código ${code || "desconocido"})`;

  switch (code) {
    case "23505":
      return new LibraryError("duplicate", detail);
    case "23503":
      return new LibraryError("parent-missing", detail);
    case "42501":
      return new LibraryError("forbidden", detail);
    case "PGRST116":
      return new LibraryError("not-found", detail);
    default:
      return new LibraryError("unavailable", detail);
  }
}
