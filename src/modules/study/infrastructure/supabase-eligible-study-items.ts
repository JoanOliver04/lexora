import type { SupabaseClient } from "@supabase/supabase-js";
import { V1_PRACTICE_MODES } from "@/modules/library/domain/taxonomy";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { readStudyRows, studyIdBatches } from "./read-study-rows";

export async function listEligibleStudyItemIds(
  client: SupabaseClient<Database>,
  { ownerId, courseId, deckIds }: { ownerId: string; courseId: string; deckIds: string[] | null },
): Promise<string[]> {
  if (deckIds && deckIds.length === 0) return [];

  const activeDeckIds: string[] = [];
  for (const batch of deckIds === null ? [null] : studyIdBatches(deckIds)) {
    const decks = await readStudyRows((from, to) => {
      let query = client
        .from("decks")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("course_id", courseId)
        .is("archived_at", null);
      if (batch) query = query.in("id", batch);
      return query.order("id").range(from, to);
    }, "no se pudieron leer los mazos de la cola");
    activeDeckIds.push(...decks.map((row) => row.id));
  }
  if (activeDeckIds.length === 0) return [];

  // Q-006: el concepto archivado no cascada al ítem; la cola lo excluye aquí.
  const conceptSet = new Set<string>();
  for (const ids of studyIdBatches(activeDeckIds)) {
    const links = await readStudyRows(
      (from, to) =>
        client
          .from("deck_concepts")
          .select("concept_id, concepts!inner(archived_at, course_id)")
          .eq("owner_id", ownerId)
          .in("deck_id", ids)
          .is("concepts.archived_at", null)
          .eq("concepts.course_id", courseId)
          .order("deck_id")
          .order("concept_id")
          .range(from, to),
      "no se pudieron leer los conceptos de la cola",
    );
    for (const row of links) conceptSet.add(row.concept_id);
  }
  const conceptIds = [...conceptSet];
  if (conceptIds.length === 0) return [];

  const itemIds: string[] = [];
  for (const ids of studyIdBatches(conceptIds)) {
    const items = await readStudyRows(
      (from, to) =>
        client
          .from("practice_items")
          .select("id")
          .eq("owner_id", ownerId)
          .eq("enabled", true)
          .in("mode", [...V1_PRACTICE_MODES])
          .is("archived_at", null)
          .in("concept_id", ids)
          .order("id")
          .range(from, to),
      "no se pudieron leer los ítems de la cola",
    );
    itemIds.push(...items.map((row) => row.id));
  }
  return itemIds;
}
