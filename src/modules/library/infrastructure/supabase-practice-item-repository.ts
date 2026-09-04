import type { SupabaseClient } from "@supabase/supabase-js";

import { libraryErrorFrom } from "@/modules/library/application/library-error";
import { type PracticeItemRepository } from "@/modules/library/application/practice-item";
import type { PracticeItem, PracticeItemConfig } from "@/modules/library/domain/practice-item";
import type { PracticeMode } from "@/modules/library/domain/taxonomy";
import type { Database, Json } from "@/shared/infrastructure/supabase/database.types";

/**
 * Implementación de `PracticeItemRepository` sobre Supabase (LEX-3.4).
 *
 * `config` es JSONB discriminado por `mode` (LEX-3.2): se guarda el objeto tal
 * cual y se relee con la misma forma. El CHECK de la base
 * (`config->>'mode' = mode`) es la última barrera si un llamador salta el
 * validador de dominio. Sin `delete` físico: un ítem tiene historial.
 */

type PracticeItemRow = Database["public"]["Tables"]["practice_items"]["Row"];

function toPracticeItem(row: PracticeItemRow): PracticeItem {
  return {
    id: row.id,
    conceptId: row.concept_id,
    ownerId: row.owner_id,
    mode: row.mode as PracticeMode,
    promptText: row.prompt_text,
    answerText: row.answer_text,
    hintText: row.hint_text,
    config: row.config as PracticeItemConfig,
    enabled: row.enabled,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createSupabasePracticeItemRepository(
  client: SupabaseClient<Database>,
): PracticeItemRepository {
  return {
    async create({ ownerId, conceptId, draft }) {
      const { data, error } = await client
        .from("practice_items")
        .insert({
          owner_id: ownerId,
          concept_id: conceptId,
          mode: draft.mode,
          prompt_text: draft.promptText,
          answer_text: draft.answerText,
          hint_text: draft.hintText,
          config: draft.config as unknown as Json,
        })
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo crear el ítem de práctica");
      return toPracticeItem(data);
    },

    async update({ ownerId, itemId, draft }) {
      const { data, error } = await client
        .from("practice_items")
        .update({
          mode: draft.mode,
          prompt_text: draft.promptText,
          answer_text: draft.answerText,
          hint_text: draft.hintText,
          config: draft.config as unknown as Json,
        })
        .eq("id", itemId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo actualizar el ítem de práctica");
      return toPracticeItem(data);
    },

    async setArchived({ ownerId, itemId, archived }) {
      const { data, error } = await client
        .from("practice_items")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", itemId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo archivar el ítem de práctica");
      return toPracticeItem(data);
    },

    async listByConcept({ ownerId, conceptId, includeArchived }) {
      let query = client
        .from("practice_items")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("concept_id", conceptId);
      if (!includeArchived) query = query.is("archived_at", null);
      const { data, error } = await query.order("created_at", { ascending: true });
      if (error) throw libraryErrorFrom(error, "no se pudieron leer los ítems de práctica");
      return (data ?? []).map(toPracticeItem);
    },
  };
}
