/**
 * Error interno de la capa de aplicación de `study` (LEX-5.6).
 *
 * Misma traducción que `libraryErrorFrom`: la aplicación no deja escapar
 * códigos de PostgREST. `duplicate` aquí es la carrera de dos `ensure`
 * sobre el mismo ítem (unicidad `(owner_id, practice_item_id)`).
 */

export type StudyErrorKind =
  "duplicate" | "parent-missing" | "not-found" | "forbidden" | "unavailable";

export class StudyError extends Error {
  readonly kind: StudyErrorKind;

  constructor(kind: StudyErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StudyError";
    this.kind = kind;
  }
}

export function studyErrorFrom(
  error: { code?: string | null; message?: string } | null | undefined,
  context: string,
): StudyError {
  const code = error?.code ?? "";
  const detail = `${context} (código ${code || "desconocido"})`;

  switch (code) {
    case "23505":
      return new StudyError("duplicate", detail, { cause: error });
    case "23503":
      return new StudyError("parent-missing", detail, { cause: error });
    case "42501":
      return new StudyError("forbidden", detail, { cause: error });
    case "PGRST116":
      return new StudyError("not-found", detail, { cause: error });
    default:
      return new StudyError("unavailable", detail, { cause: error });
  }
}
