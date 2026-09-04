import type { SupabaseClient } from "@supabase/supabase-js";

import { libraryErrorFrom, LibraryError } from "@/modules/library/application/library-error";
import { type TagRepository } from "@/modules/library/application/tag";
import type { Concept } from "@/modules/library/domain/concept";
import type { CefrLevel, ConceptKind } from "@/modules/library/domain/taxonomy";
import type { Tag } from "@/modules/library/domain/tag";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

/**
 * Implementación de `TagRepository` sobre Supabase (LEX-3.4).
 *
 * Una etiqueta duplicada equivalente en el mismo curso choca con el índice
 * único `tags (course_id, normalized_name)` (LEX-3.3) → `23505` →
 * `LibraryError('duplicate')`. Una etiqueta **sí se borra de verdad** (no tiene
 * historial); `concept_tags` es de enlace y su borrado también es físico.
 */

type TagRow = Database["public"]["Tables"]["tags"]["Row"];
type ConceptRow = Database["public"]["Tables"]["concepts"]["Row"];

function toTag(row: TagRow): Tag {
  return {
    id: row.id,
    courseId: row.course_id,
    ownerId: row.owner_id,
    normalizedName: row.normalized_name,
    displayName: row.display_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toConcept(row: ConceptRow): Concept {
  return {
    id: row.id,
    courseId: row.course_id,
    ownerId: row.owner_id,
    kind: row.kind as ConceptKind,
    title: row.title,
    canonicalKey: row.canonical_key ?? "",
    summary: row.summary,
    explanation: row.explanation,
    example: row.example,
    cefrLevel: row.cefr_level as CefrLevel | null,
    sourceReference: row.source_reference,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabaseTagRepository(client: SupabaseClient<Database>): TagRepository {
  return {
    async create({ ownerId, courseId, draft }) {
      const { data, error } = await client
        .from("tags")
        .insert({
          owner_id: ownerId,
          course_id: courseId,
          normalized_name: draft.normalizedName,
          display_name: draft.displayName,
        })
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo crear la etiqueta");
      return toTag(data);
    },

    async rename({ ownerId, tagId, draft }) {
      const { data, error } = await client
        .from("tags")
        .update({ normalized_name: draft.normalizedName, display_name: draft.displayName })
        .eq("id", tagId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo renombrar la etiqueta");
      return toTag(data);
    },

    async delete({ ownerId, tagId }) {
      const { error } = await client.from("tags").delete().eq("id", tagId).eq("owner_id", ownerId);
      if (error) throw libraryErrorFrom(error, "no se pudo borrar la etiqueta");
    },

    async list({ ownerId, courseId }) {
      const { data, error } = await client
        .from("tags")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("course_id", courseId)
        .order("normalized_name", { ascending: true });
      if (error) throw libraryErrorFrom(error, "no se pudieron leer las etiquetas");
      return (data ?? []).map(toTag);
    },

    async tagConcept({ ownerId, conceptId, tagId }) {
      const { error } = await client
        .from("concept_tags")
        .upsert(
          { owner_id: ownerId, concept_id: conceptId, tag_id: tagId },
          { onConflict: "concept_id,tag_id", ignoreDuplicates: true },
        );
      if (error) throw libraryErrorFrom(error, "no se pudo etiquetar el concepto");
    },

    async untagConcept({ ownerId, conceptId, tagId }) {
      const { error } = await client
        .from("concept_tags")
        .delete()
        .eq("owner_id", ownerId)
        .eq("concept_id", conceptId)
        .eq("tag_id", tagId);
      if (error) throw libraryErrorFrom(error, "no se pudo quitar la etiqueta del concepto");
    },

    async listForConcept({ ownerId, conceptId }) {
      const { data, error } = await client
        .from("concept_tags")
        .select("tags!inner(*)")
        .eq("owner_id", ownerId)
        .eq("concept_id", conceptId);
      if (error) throw libraryErrorFrom(error, "no se pudieron leer las etiquetas del concepto");
      return (data ?? []).map((row) => {
        if (!row.tags) throw new LibraryError("unavailable", "concept_tags sin etiqueta asociada");
        return toTag(row.tags as TagRow);
      });
    },

    async listConcepts({ ownerId, tagId }) {
      const { data, error } = await client
        .from("concept_tags")
        .select("concepts!inner(*)")
        .eq("owner_id", ownerId)
        .eq("tag_id", tagId)
        .is("concepts.archived_at", null);
      if (error) throw libraryErrorFrom(error, "no se pudieron leer los conceptos de la etiqueta");
      return (data ?? []).map((row) => {
        if (!row.concepts)
          throw new LibraryError("unavailable", "concept_tags sin concepto asociado");
        return toConcept(row.concepts as ConceptRow);
      });
    },
  };
}
