import type { SupabaseClient } from "@supabase/supabase-js";

import { type ConceptRepository } from "@/modules/library/application/concept";
import { libraryErrorFrom } from "@/modules/library/application/library-error";
import type { Concept } from "@/modules/library/domain/concept";
import type { CefrLevel, ConceptKind } from "@/modules/library/domain/taxonomy";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

/**
 * Implementación de `ConceptRepository` sobre Supabase (LEX-3.4).
 *
 * `canonical_key` es una columna **generada** (LEX-3.2): el `insert` se
 * construye campo a campo y **no** la incluye —enviarla falla con `428C9`
 * aunque el tipo generado la marque como opcional—. Se lee de la fila
 * devuelta. `metadata` se deja a su valor por defecto (`'{}'`); su edición no
 * es de la V1.
 *
 * Sin `delete` físico: un concepto tiene historial y se archiva.
 */

type ConceptRow = Database["public"]["Tables"]["concepts"]["Row"];

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

export function createSupabaseConceptRepository(
  client: SupabaseClient<Database>,
): ConceptRepository {
  return {
    async create({ ownerId, courseId, draft }) {
      const { data, error } = await client
        .from("concepts")
        .insert({
          owner_id: ownerId,
          course_id: courseId,
          kind: draft.kind,
          title: draft.title,
          summary: draft.summary,
          explanation: draft.explanation,
          example: draft.example,
          cefr_level: draft.cefrLevel,
          source_reference: draft.sourceReference,
        })
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo crear el concepto");
      return toConcept(data);
    },

    async update({ ownerId, conceptId, draft }) {
      const { data, error } = await client
        .from("concepts")
        .update({
          kind: draft.kind,
          title: draft.title,
          summary: draft.summary,
          explanation: draft.explanation,
          example: draft.example,
          cefr_level: draft.cefrLevel,
          source_reference: draft.sourceReference,
        })
        .eq("id", conceptId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo actualizar el concepto");
      return toConcept(data);
    },

    async setArchived({ ownerId, conceptId, archived }) {
      const { data, error } = await client
        .from("concepts")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", conceptId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo archivar el concepto");
      return toConcept(data);
    },

    async list({ ownerId, courseId, includeArchived }) {
      let query = client
        .from("concepts")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("course_id", courseId);
      if (!includeArchived) query = query.is("archived_at", null);
      const { data, error } = await query.order("title", { ascending: true });
      if (error) throw libraryErrorFrom(error, "no se pudieron leer los conceptos");
      return (data ?? []).map(toConcept);
    },

    async get({ ownerId, conceptId }) {
      const { data, error } = await client
        .from("concepts")
        .select("*")
        .eq("id", conceptId)
        .eq("owner_id", ownerId)
        .maybeSingle();
      if (error) throw libraryErrorFrom(error, "no se pudo leer el concepto");
      return data ? toConcept(data) : null;
    },
  };
}
