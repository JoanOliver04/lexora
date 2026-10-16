import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionHistoryRepository } from "@/modules/study/application/session-summary";
import { isMemoryPhase } from "@/modules/study/domain/memory";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { readStudyRows } from "./read-study-rows";

export function createSupabaseSessionHistoryRepository(
  client: SupabaseClient<Database>,
): SessionHistoryRepository {
  return {
    async listReviews({ ownerId, sessionId, now }) {
      const rows = await readStudyRows(
        (from, to) =>
          client
            .from("review_logs")
            .select("id, practice_item_id, rating, duration_ms, phase_before:state_before->>phase")
            .eq("owner_id", ownerId)
            .eq("study_session_id", sessionId)
            .lte("reviewed_at", now.toISOString())
            .order("id")
            .range(from, to),
        "no se pudieron leer los repasos de la sesión",
      );
      return rows.map((row) => ({
        id: row.id,
        practiceItemId: row.practice_item_id,
        rating: row.rating,
        durationMs: row.duration_ms,
        phaseBefore: isMemoryPhase(row.phase_before) ? row.phase_before : null,
      }));
    },
  };
}
