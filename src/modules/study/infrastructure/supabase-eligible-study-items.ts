import type { SupabaseClient } from "@supabase/supabase-js";
import { V1_PRACTICE_MODES } from "@/modules/library/domain/taxonomy";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { STUDY_PAGE_SIZE, studyIdBatches } from "./read-study-rows";

export async function listEligibleStudyItemIds(
  client: SupabaseClient<Database>,
  { ownerId, courseId, deckIds }: { ownerId: string; courseId: string; deckIds: string[] | null },
): Promise<string[]> {
  const itemIds = new Set<string>();
  for (const batch of deckIds === null ? [null] : studyIdBatches(deckIds)) {
    let after: string | null = null;
    for (;;) {
      // One active deck membership is sufficient. Keep the joins inside the
      // user's RLS context and only paginate the top-level item IDs.
      let query = client
        .from("practice_items")
        .select("id, concepts!inner(deck_concepts!inner(decks!inner()))")
        .eq("owner_id", ownerId)
        .eq("enabled", true)
        .in("mode", [...V1_PRACTICE_MODES])
        .is("archived_at", null)
        .eq("concepts.course_id", courseId)
        .is("concepts.archived_at", null)
        .eq("concepts.deck_concepts.decks.course_id", courseId)
        .is("concepts.deck_concepts.decks.archived_at", null)
        .limit(1, { referencedTable: "concepts.deck_concepts" })
        .order("id")
        .limit(STUDY_PAGE_SIZE);
      if (batch) query = query.in("concepts.deck_concepts.deck_id", batch);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) throw studyErrorFrom(error, "no se pudieron leer los ítems de la cola");
      if (!data) break;
      for (const { id } of data) itemIds.add(id);
      if (data.length < STUDY_PAGE_SIZE) break;
      after = data[data.length - 1]!.id;
    }
  }
  return [...itemIds];
}
