import type { SupabaseClient } from "@supabase/supabase-js";
import type { HistoryRepository } from "../application/review-history";
import { isMemoryPhase } from "../domain/memory";
import { studyErrorFrom } from "../application/study-error";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

const COLUMNS =
  "id,reviewed_at,rating,duration_ms,phase_before:state_before->>phase,phase_after:state_after->>phase,due_after:state_after->>dueAt,item:practice_items!inner(id,mode,concept:concepts!inner(id,title,course_id))";
const DECK_COLUMNS =
  "id,reviewed_at,rating,duration_ms,phase_before:state_before->>phase,phase_after:state_after->>phase,due_after:state_after->>dueAt,item:practice_items!inner(id,mode,concept:concepts!inner(id,title,course_id,memberships:deck_concepts!inner(deck_id)))";

export function createSupabaseReviewHistoryRepository(
  client: SupabaseClient<Database>,
): HistoryRepository {
  return {
    async list({ ownerId, courseId, filters, asOf, limit, fromUtc, untilUtc }) {
      let query = filters.deckId
        ? client
            .from("review_logs")
            .select(DECK_COLUMNS)
            .eq("item.concept.memberships.deck_id", filters.deckId)
        : client.from("review_logs").select(COLUMNS);
      query = query
        .eq("owner_id", ownerId)
        .eq("item.concept.course_id", courseId)
        .lte("reviewed_at", asOf)
        .order("reviewed_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (fromUtc) query = query.gte("reviewed_at", fromUtc);
      if (untilUtc) query = query.lt("reviewed_at", untilUtc);
      if (filters.rating) query = query.eq("rating", filters.rating);
      if (filters.phase) query = query.eq("state_before->>phase", filters.phase);
      if (filters.conceptId) query = query.eq("item.concept.id", filters.conceptId);
      if (filters.itemId) query = query.eq("practice_item_id", filters.itemId);
      if (filters.cursor) {
        const { at, id } = filters.cursor;
        query = query.or(`reviewed_at.lt.${at},and(reviewed_at.eq.${at},id.lt.${id})`);
      }
      const { data, error } = await query;
      if (error) throw studyErrorFrom(error, "Could not read review history");
      return (data ?? []).map((row) => ({
        id: row.id,
        reviewedAt: row.reviewed_at,
        rating: row.rating,
        durationMs: row.duration_ms,
        phaseBefore: isMemoryPhase(row.phase_before) ? row.phase_before : null,
        phaseAfter: isMemoryPhase(row.phase_after) ? row.phase_after : null,
        dueAfter:
          row.due_after && Number.isFinite(Date.parse(row.due_after)) ? row.due_after : null,
        itemId: row.item.id,
        mode: row.item.mode,
        conceptId: row.item.concept.id,
        title: row.item.concept.title,
      }));
    },
  };
}
