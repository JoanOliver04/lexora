import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ItemDifficultySignals,
  TodayOverviewRepository,
} from "@/modules/study/application/today-overview";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import { MAX_REVIEW_DURATION_MS } from "@/modules/study/domain/study-time-estimate";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

import { readStudyRows, studyIdBatches, STUDY_PAGE_SIZE } from "./read-study-rows";

export function createSupabaseTodayOverviewRepository(
  client: SupabaseClient<Database>,
): TodayOverviewRepository {
  return {
    async getDifficultySignals({ ownerId, practiceItemIds, now }) {
      const signals: ItemDifficultySignals[] = [];
      for (const ids of studyIdBatches(practiceItemIds)) {
        const states = await readStudyRows(
          (from, to) =>
            client
              .from("learning_states")
              .select("practice_item_id, lapses")
              .eq("owner_id", ownerId)
              .in("practice_item_id", ids)
              .order("id")
              .range(from, to),
          "no se pudieron leer los lapsos de Hoy",
        );
        const byItem = new Map<string, ItemDifficultySignals>(
          states.map((row) => [
            row.practice_item_id,
            { practiceItemId: row.practice_item_id, lapses: row.lapses, recentRatings: [] },
          ]),
        );
        // Items already difficult by lapses need no historical rating scan.
        const ratingIds = states.filter((row) => row.lapses < 3).map((row) => row.practice_item_id);
        if (ratingIds.length > 0) {
          for (let from = 0; ; from += STUDY_PAGE_SIZE) {
            const { data, error } = await client
              .from("review_logs")
              .select("practice_item_id, rating")
              .eq("owner_id", ownerId)
              .in("practice_item_id", ratingIds)
              .lte("reviewed_at", now.toISOString())
              .order("reviewed_at", { ascending: false })
              .order("id", { ascending: false })
              .range(from, from + STUDY_PAGE_SIZE - 1);
            if (error) throw studyErrorFrom(error, "no se pudieron leer las valoraciones de Hoy");
            for (const row of data ?? []) {
              const signal = byItem.get(row.practice_item_id);
              if (signal && signal.recentRatings.length < 3) signal.recentRatings.push(row.rating);
            }
            if (
              (data ?? []).length < STUDY_PAGE_SIZE ||
              ratingIds.every((id) => byItem.get(id)!.recentRatings.length === 3)
            )
              break;
          }
        }
        signals.push(...byItem.values());
      }
      return signals;
    },

    async listRecentDurations({ ownerId, since, now, limit }) {
      const { data, error } = await client
        .from("review_logs")
        .select("duration_ms")
        .eq("owner_id", ownerId)
        .gte("reviewed_at", since.toISOString())
        .lte("reviewed_at", now.toISOString())
        .gt("duration_ms", 0)
        .lte("duration_ms", MAX_REVIEW_DURATION_MS)
        .order("reviewed_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw studyErrorFrom(error, "no se pudieron leer las duraciones recientes");
      return (data ?? []).map((row) => row.duration_ms);
    },
  };
}
