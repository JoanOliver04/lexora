import type { SupabaseClient } from "@supabase/supabase-js";

import type { DailyQueueRepository } from "@/modules/study/application/daily-queue";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import type { QueueCandidate } from "@/modules/study/domain/queue";
import type { MemoryPhase } from "@/modules/study/domain/memory";
import { isMemoryPhase } from "@/modules/study/domain/memory";
import type { Database, Json } from "@/shared/infrastructure/supabase/database.types";

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

      let decksQuery = client
        .from("decks")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("course_id", courseId)
        .is("archived_at", null);
      if (deckIds) decksQuery = decksQuery.in("id", deckIds);

      const { data: decks, error: decksError } = await decksQuery;
      if (decksError) throw studyErrorFrom(decksError, "no se pudieron leer los mazos de la cola");
      const activeDeckIds = (decks ?? []).map((row) => row.id);
      if (activeDeckIds.length === 0) return [];

      // Q-006: el concepto archivado no cascada al ítem; la cola lo excluye aquí.
      const { data: links, error: linksError } = await client
        .from("deck_concepts")
        .select("concept_id, concepts!inner(archived_at)")
        .eq("owner_id", ownerId)
        .in("deck_id", activeDeckIds)
        .is("concepts.archived_at", null);
      if (linksError) {
        throw studyErrorFrom(linksError, "no se pudieron leer los conceptos de la cola");
      }
      const conceptIds = [...new Set((links ?? []).map((row) => row.concept_id))];
      if (conceptIds.length === 0) return [];

      const { data: items, error: itemsError } = await client
        .from("practice_items")
        .select("id")
        .eq("owner_id", ownerId)
        .eq("enabled", true)
        .is("archived_at", null)
        .in("concept_id", conceptIds);
      if (itemsError) throw studyErrorFrom(itemsError, "no se pudieron leer los ítems de la cola");
      const itemIds = (items ?? []).map((row) => row.id);
      if (itemIds.length === 0) return [];

      const { data: states, error: statesError } = await client
        .from("learning_states")
        .select("id, practice_item_id, due_at, phase, revision")
        .eq("owner_id", ownerId)
        .in("practice_item_id", itemIds);
      if (statesError) {
        throw studyErrorFrom(statesError, "no se pudieron leer los estados de la cola");
      }

      const byItem = new Map<string, LearningStateRow>();
      for (const row of states ?? []) {
        byItem.set(row.practice_item_id, row);
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
      const { data, error } = await client
        .from("review_logs")
        .select("practice_item_id, state_before")
        .eq("owner_id", ownerId)
        .gte("reviewed_at", dayStart.toISOString())
        .lt("reviewed_at", dayEnd.toISOString());
      if (error) throw studyErrorFrom(error, "no se pudo leer la actividad de hoy");

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
