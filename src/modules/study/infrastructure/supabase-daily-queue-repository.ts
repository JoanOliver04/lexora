import type { SupabaseClient } from "@supabase/supabase-js";

import type { DailyQueueRepository } from "@/modules/study/application/daily-queue";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import type { QueueCandidate } from "@/modules/study/domain/queue";
import type { MemoryPhase } from "@/modules/study/domain/memory";
import { isMemoryPhase } from "@/modules/study/domain/memory";
import {
  schedulerCompatibility,
  V1_SCHEDULER_CONFIG,
} from "@/modules/study/domain/scheduler-config";
import type { Database, Json } from "@/shared/infrastructure/supabase/database.types";
import { readStudyRows } from "./read-study-rows";
import { eligibleQueuePages } from "./supabase-eligible-study-items";
import { estimateReviewRecall } from "./ts-fsrs-scheduler";

type StoredState = Database["public"]["Tables"]["learning_states"]["Row"];
type LearningStateRow = Pick<StoredState, "id" | "due_at" | "phase" | "revision"> &
  Partial<
    Pick<StoredState, "stability" | "last_reviewed_at" | "scheduler_version" | "config_version">
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

    async listEligibleItems({ ownerId, courseId, deckIds, reviewPriority }) {
      const candidates = new Map<string, QueueCandidate>();
      for await (const page of eligibleQueuePages(
        client,
        { ownerId, courseId, deckIds },
        !!reviewPriority,
      )) {
        for (const { id, learning_states } of page) {
          // PostgREST recognizes the unique owner/item pair. Generated types
          // describe the reverse of the composite foreign key as an array.
          const state = Array.isArray(learning_states) ? learning_states[0] : learning_states;
          if (!candidates.has(id)) candidates.set(id, queueCandidate(id, state, reviewPriority));
        }
      }
      return [...candidates.values()];
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

function queueCandidate(
  id: string,
  state: LearningStateRow | null | undefined,
  reviewPriority: { at: Date; dueThrough: Date } | undefined,
): QueueCandidate {
  if (!state) {
    return {
      practiceItemId: id,
      phase: null,
      dueAt: null,
      learningStateId: null,
      revision: null,
    };
  }
  const dueAt = new Date(state.due_at);
  const recallProbability =
    reviewPriority &&
    state.phase === "review" &&
    dueAt <= reviewPriority.dueThrough &&
    state.stability !== undefined &&
    state.last_reviewed_at &&
    schedulerCompatibility(
      {
        schedulerVersion: state.scheduler_version ?? "",
        configVersion: state.config_version ?? "",
      },
      V1_SCHEDULER_CONFIG,
    ).ok
      ? estimateReviewRecall(state.stability, new Date(state.last_reviewed_at), reviewPriority.at)
      : null;
  return {
    practiceItemId: id,
    phase: state.phase as MemoryPhase,
    dueAt,
    learningStateId: state.id,
    revision: state.revision,
    ...(recallProbability === null ? {} : { recallProbability }),
  };
}
