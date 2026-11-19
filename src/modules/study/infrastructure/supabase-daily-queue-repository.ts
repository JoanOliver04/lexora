import type { SupabaseClient } from "@supabase/supabase-js";

import type { DailyQueueRepository } from "@/modules/study/application/daily-queue";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import type { QueueCandidate } from "@/modules/study/domain/queue";
import type { MemoryPhase } from "@/modules/study/domain/memory";
import { isMemoryPhase } from "@/modules/study/domain/memory";
import type { Database, Json } from "@/shared/infrastructure/supabase/database.types";
import { readStudyRows, studyIdBatches } from "./read-study-rows";
import { listEligibleStudyItemIds } from "./supabase-eligible-study-items";

type LearningStateRow = Pick<
  Database["public"]["Tables"]["learning_states"]["Row"],
  "id" | "practice_item_id" | "due_at" | "phase" | "revision"
>;

function phaseFromSnapshot(raw: Json): MemoryPhase | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const phase = (raw as { phase?: unknown }).phase;
  return isMemoryPhase(phase) ? phase : null;
}

export function createSupabaseDailyQueueRepository(
  client: SupabaseClient<Database>,
): DailyQueueRepository {
  return {
    async getCourseLimits({ ownerId, courseId }) {
      const { data, error } = await client
        .from("course_settings")
        .select("daily_new_limit, maximum_reviews_per_day")
        .eq("user_id", ownerId)
        .eq("course_id", courseId)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "no se pudieron leer los límites del curso");
      if (!data) return null;
      return {
        dailyNewLimit: data.daily_new_limit,
        maximumReviewsPerDay: data.maximum_reviews_per_day,
      };
    },

    async listEligibleItems({ ownerId, courseId, deckIds }) {
      const itemIds = await listEligibleStudyItemIds(client, { ownerId, courseId, deckIds });
      if (itemIds.length === 0) return [];

      const byItem = new Map<string, LearningStateRow>();
      for (const ids of studyIdBatches(itemIds)) {
        const states = await readStudyRows(
          (from, to) =>
            client
              .from("learning_states")
              .select("id, practice_item_id, due_at, phase, revision")
              .eq("owner_id", ownerId)
              .in("practice_item_id", ids)
              .order("id")
              .range(from, to),
          "no se pudieron leer los estados de la cola",
        );
        for (const row of states) byItem.set(row.practice_item_id, row);
      }

      const candidates: QueueCandidate[] = itemIds.map((id) => {
        const state = byItem.get(id);
        if (!state) {
          return {
            practiceItemId: id,
            phase: null,
            dueAt: null,
            learningStateId: null,
            revision: null,
          };
        }
        return {
          practiceItemId: id,
          phase: state.phase as MemoryPhase,
          dueAt: new Date(state.due_at),
          learningStateId: state.id,
          revision: state.revision,
        };
      });
      return candidates;
    },

    async countTodayActivity({ ownerId, courseId, dayStart, dayEnd }) {
      const data = await readStudyRows(
        (from, to) =>
          client
            .from("review_logs")
            .select(
              "practice_item_id, state_before, practice_items!inner(concepts!inner(course_id))",
            )
            .eq("owner_id", ownerId)
            .eq("practice_items.concepts.course_id", courseId)
            .gte("reviewed_at", dayStart.toISOString())
            .lt("reviewed_at", dayEnd.toISOString())
            .order("id")
            .range(from, to),
        "no se pudo leer la actividad de hoy",
      );

      const newIds = new Set<string>();
      let reviewsDone = 0;
      for (const row of data ?? []) {
        const phase = phaseFromSnapshot(row.state_before);
        if (phase === "new") newIds.add(row.practice_item_id);
        if (phase === "review") reviewsDone += 1;
      }
      return { newIntroduced: newIds.size, reviewsDone };
    },
  };
}
