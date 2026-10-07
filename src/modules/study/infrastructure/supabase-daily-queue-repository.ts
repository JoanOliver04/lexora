import type { SupabaseClient } from "@supabase/supabase-js";

import type { DailyQueueRepository } from "@/modules/study/application/daily-queue";
import { V1_PRACTICE_MODES } from "@/modules/library/domain/taxonomy";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import type { QueueCandidate } from "@/modules/study/domain/queue";
import type { MemoryPhase } from "@/modules/study/domain/memory";
import { isMemoryPhase } from "@/modules/study/domain/memory";
import type { Database, Json } from "@/shared/infrastructure/supabase/database.types";
import { readStudyRows, studyIdBatches } from "./read-study-rows";

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

    async countTodayActivity({ ownerId, dayStart, dayEnd }) {
      const data = await readStudyRows(
        (from, to) =>
          client
            .from("review_logs")
            .select("practice_item_id, state_before")
            .eq("owner_id", ownerId)
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

    async getTimeZone({ ownerId }) {
      const { data, error } = await client
        .from("profiles")
        .select("timezone")
        .eq("id", ownerId)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "no se pudo leer la zona horaria");
      return data?.timezone ?? null;
    },
  };
}
