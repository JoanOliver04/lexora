/**
 * Puerto y casos de uso de etiquetas (LEX-3.4).
 *
 * El dominio (`validateTagDraft`) normaliza y valida el nombre (jerarquía `::`,
 * segmento vacío). La unicidad equivalente por curso la impone la base
 * (índice único `tags (course_id, normalized_name)`, LEX-3.3): el adaptador la
 * traduce a `LibraryError('duplicate')`, que el caso de uso propaga.
 *
 * A diferencia de mazos, conceptos e ítems, una etiqueta **sí se borra de
 * verdad**: no tiene historial. `concept_tags` es una tabla de enlace; quitar
 * una etiqueta de un concepto también es un borrado real.
 */

import { type Concept } from "@/modules/library/domain/concept";
import {
  type Tag,
  type TagDraft,
  type TagIssue,
  validateTagDraft,
} from "@/modules/library/domain/tag";

/**
 * Puerto: alguien sabe leer y escribir etiquetas del usuario y sus enlaces con
 * conceptos. `ownerId` de `getClaims()`, nunca del cliente. El puerto recibe el
 * `TagDraft` ya normalizado por el dominio (`displayName` + `normalizedName`),
 * no un string suelto: el adaptador no re-normaliza.
 */
export interface TagRepository {
  create(input: { ownerId: string; courseId: string; draft: TagDraft }): Promise<Tag>;
  rename(input: { ownerId: string; tagId: string; draft: TagDraft }): Promise<Tag>;
  delete(input: { ownerId: string; tagId: string }): Promise<void>;
  /** Etiquetas del curso, en orden alfabético por nombre normalizado. */
  list(input: { ownerId: string; courseId: string }): Promise<Tag[]>;
  tagConcept(input: { ownerId: string; conceptId: string; tagId: string }): Promise<void>;
  untagConcept(input: { ownerId: string; conceptId: string; tagId: string }): Promise<void>;
  /** Etiquetas de un concepto. */
  listForConcept(input: { ownerId: string; conceptId: string }): Promise<Tag[]>;
  /**
   * Etiquetas de varios conceptos a la vez, en una sola consulta (LEX-3.9):
   * resuelve el N+1 anotado en la evidencia de LEX-3.6 (`listConceptTags` una
   * vez por concepto en la lista). Un `conceptId` sin etiquetas no aparece
   * como clave del resultado.
   */
  listForConcepts(input: { ownerId: string; conceptIds: string[] }): Promise<Record<string, Tag[]>>;
  /** Conceptos con una etiqueta. Excluye los conceptos archivados. */
  listConcepts(input: { ownerId: string; tagId: string }): Promise<Concept[]>;
}

export type TagOutcome = { ok: true; tag: Tag } | { ok: false; issues: TagIssue[] };

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de biblioteca invocado sin identificador de usuario");
  }
}

export async function createTag(
  repository: TagRepository,
  ownerId: string,
  courseId: string,
  rawName: unknown,
): Promise<TagOutcome> {
  assertUserId(ownerId);
  const validation = validateTagDraft({ name: rawName });
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  const tag = await repository.create({ ownerId, courseId, draft: validation.value });
  return { ok: true, tag };
}

export async function renameTag(
  repository: TagRepository,
  ownerId: string,
  tagId: string,
  rawName: unknown,
): Promise<TagOutcome> {
  assertUserId(ownerId);
  const validation = validateTagDraft({ name: rawName });
  if (!validation.ok) {
    return { ok: false, issues: validation.issues };
  }
  const tag = await repository.rename({ ownerId, tagId, draft: validation.value });
  return { ok: true, tag };
}

export async function deleteTag(
  repository: TagRepository,
  ownerId: string,
  tagId: string,
): Promise<void> {
  assertUserId(ownerId);
  await repository.delete({ ownerId, tagId });
}

export async function listTags(
  repository: TagRepository,
  ownerId: string,
  courseId: string,
): Promise<Tag[]> {
  assertUserId(ownerId);
  return repository.list({ ownerId, courseId });
}

export async function tagConcept(
  repository: TagRepository,
  ownerId: string,
  input: { conceptId: string; tagId: string },
): Promise<void> {
  assertUserId(ownerId);
  await repository.tagConcept({ ownerId, conceptId: input.conceptId, tagId: input.tagId });
}

export async function untagConcept(
  repository: TagRepository,
  ownerId: string,
  input: { conceptId: string; tagId: string },
): Promise<void> {
  assertUserId(ownerId);
  await repository.untagConcept({ ownerId, conceptId: input.conceptId, tagId: input.tagId });
}

export async function listConceptTags(
  repository: TagRepository,
  ownerId: string,
  conceptId: string,
): Promise<Tag[]> {
  assertUserId(ownerId);
  return repository.listForConcept({ ownerId, conceptId });
}

/** Etiquetas de varios conceptos en una consulta. `conceptIds` vacío no consulta. */
export async function listTagsForConcepts(
  repository: TagRepository,
  ownerId: string,
  conceptIds: string[],
): Promise<Record<string, Tag[]>> {
  assertUserId(ownerId);
  if (conceptIds.length === 0) return {};
  return repository.listForConcepts({ ownerId, conceptIds });
}

export async function listConceptsWithTag(
  repository: TagRepository,
  ownerId: string,
  tagId: string,
): Promise<Concept[]> {
  assertUserId(ownerId);
  return repository.listConcepts({ ownerId, tagId });
}
