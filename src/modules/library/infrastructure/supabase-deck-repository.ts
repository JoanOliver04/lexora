import type { SupabaseClient } from "@supabase/supabase-js";

import { type DeckConcept, type DeckRepository } from "@/modules/library/application/deck";
import { libraryErrorFrom, LibraryError } from "@/modules/library/application/library-error";
import type { CefrLevel, ConceptKind, DeckCategory } from "@/modules/library/domain/taxonomy";
import type { Deck } from "@/modules/library/domain/deck";
import type { Concept } from "@/modules/library/domain/concept";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

/**
 * Implementación de `DeckRepository` sobre Supabase (LEX-3.4).
 *
 * El cliente llega ya creado, uno por petición, con la cookie de sesión: cada
 * consulta corre bajo la identidad del usuario y las políticas de LEX-3.3
 * (`decks_*_own`, `deck_concepts_*_own`) son la segunda barrera. Los `.eq("owner_id", …)`
 * explícitos no sustituyen a la RLS: hacen la intención legible y acotan el
 * `update`/`delete` a una fila concreta.
 *
 * `canonical_key` no aparece aquí (es de `concepts`). Ningún método hace un
 * `delete` físico de `decks`: se archiva con `archived_at`.
 */

type DeckRow = Database["public"]["Tables"]["decks"]["Row"];
type ConceptRow = Database["public"]["Tables"]["concepts"]["Row"];

function toDeck(row: DeckRow): Deck {
  return {
    id: row.id,
    courseId: row.course_id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description,
    cefrLevel: row.cefr_level as CefrLevel | null,
    category: row.category as DeckCategory | null,
    position: row.position,
    archivedAt: row.archived_at,
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

export function createSupabaseDeckRepository(client: SupabaseClient<Database>): DeckRepository {
  return {
    async create({ ownerId, courseId, draft }) {
      // Un mazo nuevo se añade al final: `position = max(position) + 1` del
      // curso. Sin `position` explícita caería en el default `0` y, tras
      // cualquier reordenación que normaliza a `0..n-1`, quedaría empatado
      // arriba en lugar de al final. No es atómico frente a dos altas a la vez
      // (colisión benigna: la reordenación posterior lo sanea).
      const { data: last, error: lastError } = await client
        .from("decks")
        .select("position")
        .eq("owner_id", ownerId)
        .eq("course_id", courseId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastError) throw libraryErrorFrom(lastError, "no se pudo crear el mazo");

      const { data, error } = await client
        .from("decks")
        .insert({
          owner_id: ownerId,
          course_id: courseId,
          title: draft.title,
          description: draft.description,
          cefr_level: draft.cefrLevel,
          category: draft.category,
          position: (last?.position ?? -1) + 1,
        })
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo crear el mazo");
      return toDeck(data);
    },

    async update({ ownerId, deckId, draft }) {
      const { data, error } = await client
        .from("decks")
        .update({
          title: draft.title,
          description: draft.description,
          cefr_level: draft.cefrLevel,
          category: draft.category,
        })
        .eq("id", deckId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo actualizar el mazo");
      return toDeck(data);
    },

    async setArchived({ ownerId, deckId, archived }) {
      const { data, error } = await client
        .from("decks")
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq("id", deckId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      if (error) throw libraryErrorFrom(error, "no se pudo archivar el mazo");
      return toDeck(data);
    },

    async list({ ownerId, courseId, includeArchived }) {
      let query = client
        .from("decks")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("course_id", courseId);
      if (!includeArchived) query = query.is("archived_at", null);
      const { data, error } = await query
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw libraryErrorFrom(error, "no se pudieron leer los mazos");
      return (data ?? []).map(toDeck);
    },

    async addConcept({ ownerId, deckId, conceptId, position }) {
      // `upsert` con `ignoreDuplicates`: volver a añadir un concepto ya presente
      // es un no-op, no un error (la PK es `(deck_id, concept_id)`).
      const { error } = await client
        .from("deck_concepts")
        .upsert(
          { owner_id: ownerId, deck_id: deckId, concept_id: conceptId, position },
          { onConflict: "deck_id,concept_id", ignoreDuplicates: true },
        );
      if (error) throw libraryErrorFrom(error, "no se pudo añadir el concepto al mazo");
    },

    async removeConcept({ ownerId, deckId, conceptId }) {
      const { error } = await client
        .from("deck_concepts")
        .delete()
        .eq("owner_id", ownerId)
        .eq("deck_id", deckId)
        .eq("concept_id", conceptId);
      if (error) throw libraryErrorFrom(error, "no se pudo quitar el concepto del mazo");
    },

    async reorder({ ownerId, courseId, deckIds }) {
      // `decks.position` no tiene índice único (LEX-3.2), así que N `update`
      // sueltos no colisionan entre sí. No hay transacción: un fallo a mitad
      // deja el orden a medias (deuda anotada en la evidencia de LEX-3.5). Los
      // `.eq` acotan cada escritura a una fila del propio usuario y curso.
      const results = await Promise.all(
        deckIds.map((deckId, index) =>
          client
            .from("decks")
            .update({ position: index })
            .eq("id", deckId)
            .eq("owner_id", ownerId)
            .eq("course_id", courseId),
        ),
      );
      const failure = results.find((result) => result.error);
      if (failure?.error) {
        throw libraryErrorFrom(failure.error, "no se pudieron reordenar los mazos");
      }
    },

    async search({
      ownerId,
      courseId,
      includeArchived,
      search,
      category,
      cefrLevel,
      limit,
      offset,
    }) {
      let query = client
        .from("decks")
        .select("*", { count: "exact" })
        .eq("owner_id", ownerId)
        .eq("course_id", courseId);
      if (!includeArchived) query = query.is("archived_at", null);
      if (search) query = query.ilike("title", `%${search}%`);
      if (category) query = query.eq("category", category);
      if (cefrLevel) query = query.eq("cefr_level", cefrLevel);
      const { data, error, count } = await query
        .order("position", { ascending: true })
        .order("created_at", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw libraryErrorFrom(error, "no se pudieron buscar los mazos");
      return { items: (data ?? []).map(toDeck), total: count ?? 0 };
    },

    async countConceptsByDeck({ ownerId, deckIds }) {
      // Una consulta con los `deckIds` de la página visible, agrupada en
      // memoria: a los volúmenes de la V1 es más simple y más barato que una
      // vista o función agregada, y evita una migración para esto (§ evidencia
      // LEX-3.9). El `!inner` descarta filas cuyo concepto ya no exista y
      // permite filtrar `archived_at` del concepto embebido.
      const { data, error } = await client
        .from("deck_concepts")
        .select("deck_id, concepts!inner(archived_at)")
        .eq("owner_id", ownerId)
        .in("deck_id", deckIds)
        .is("concepts.archived_at", null);
      if (error) throw libraryErrorFrom(error, "no se pudieron contar los conceptos de los mazos");
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.deck_id] = (counts[row.deck_id] ?? 0) + 1;
      }
      return counts;
    },

    async listConcepts({ ownerId, deckId }): Promise<DeckConcept[]> {
      const { data, error } = await client
        .from("deck_concepts")
        .select("position, concepts!inner(*)")
        .eq("owner_id", ownerId)
        .eq("deck_id", deckId)
        .is("concepts.archived_at", null)
        .order("position", { ascending: true, nullsFirst: false });
      if (error) throw libraryErrorFrom(error, "no se pudieron leer los conceptos del mazo");
      return (data ?? []).map((row) => {
        const concept = row.concepts;
        if (!concept) {
          throw new LibraryError("unavailable", "deck_concepts sin concepto asociado");
        }
        return { concept: toConcept(concept as ConceptRow), position: row.position };
      });
    },
  };
}
