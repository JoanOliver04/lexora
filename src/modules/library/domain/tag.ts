/**
 * Etiqueta (MASTER_SPEC §9.6, §13.10).
 *
 * Etiqueta propia del usuario dentro de un curso. Se guarda un nombre visible y
 * un nombre normalizado; los duplicados equivalentes dentro del mismo curso se
 * impiden por el normalizado (restricción en LEX-3.3). La jerarquía importada
 * con `::` se conserva sin obligar a convertirla en un árbol. Lógica pura
 * (LEX-3.1).
 */

import { isRecord, normalizeWhitespace, TITLE_MAX_LENGTH } from "./taxonomy";

/** Separador de jerarquía en etiquetas importadas de Anki. */
export const TAG_HIERARCHY_SEPARATOR = "::";

/** Etiqueta ya persistida. */
export interface Tag {
  id: string;
  courseId: string;
  ownerId: string;
  normalizedName: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

/** Lo que una persona escribe. `normalizedName` se deriva. */
export interface TagDraft {
  displayName: string;
  normalizedName: string;
}

export type TagIssue = "tag.name.empty" | "tag.name.tooLong" | "tag.name.emptySegment";

export type TagValidation = { ok: true; value: TagDraft } | { ok: false; issues: TagIssue[] };

/**
 * Nombre normalizado para comparar e impedir duplicados. Minúsculas, extremos
 * recortados, espacios internos colapsados y espacios alrededor de `::`
 * eliminados (`a :: b` → `a::b`). No quita acentos, por el mismo motivo que
 * `canonicalKey` de concepto.
 */
export function normalizeTagName(raw: string): string {
  return normalizeWhitespace(raw)
    .toLowerCase()
    .split(TAG_HIERARCHY_SEPARATOR)
    .map((segment) => segment.trim())
    .join(TAG_HIERARCHY_SEPARATOR);
}

/** Segmentos de una etiqueta jerárquica. `a::b::c` → `["a", "b", "c"]`. */
export function tagSegments(name: string): string[] {
  return name.split(TAG_HIERARCHY_SEPARATOR).map((segment) => segment.trim());
}

/**
 * Valida un nombre de etiqueta. Rechaza el vacío, el demasiado largo y la
 * jerarquía mal formada (`a::`, `::b`, `a::::b`): un segmento vacío no es una
 * etiqueta.
 */
export function validateTagDraft(raw: unknown): TagValidation {
  const input = isRecord(raw) ? raw : {};
  const issues: TagIssue[] = [];

  const rawName = input["name"];
  const displayName = typeof rawName === "string" ? normalizeWhitespace(rawName) : "";
  const normalizedName = displayName === "" ? "" : normalizeTagName(displayName);

  if (normalizedName === "") {
    issues.push("tag.name.empty");
    return { ok: false, issues };
  }

  if (normalizedName.length > TITLE_MAX_LENGTH) {
    issues.push("tag.name.tooLong");
  }

  if (tagSegments(normalizedName).some((segment) => segment === "")) {
    issues.push("tag.name.emptySegment");
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return { ok: true, value: { displayName, normalizedName } };
}
