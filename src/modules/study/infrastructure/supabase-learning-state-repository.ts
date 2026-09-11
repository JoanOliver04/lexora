import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  LearningStateRepository,
  StoredLearningState,
} from "@/modules/study/application/learning-state";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import type { LearningState, MemoryPhase } from "@/modules/study/domain/memory";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

type LearningStateRow = Database["public"]["Tables"]["learning_states"]["Row"];

function toState(row: LearningStateRow): LearningState {
  return {
    phase: row.phase as MemoryPhase,
    dueAt: new Date(row.due_at),
    lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : null,
    stability: row.stability,
    difficulty: row.difficulty,
    scheduledDays: row.scheduled_days,
    learningStep: row.learning_step,
    reps: row.reps,
    lapses: row.lapses,
  };
}

function toStored(row: LearningStateRow): StoredLearningState {
  return {
    id: row.id,
    ownerId: row.owner_id,
    practiceItemId: row.practice_item_id,
    revision: row.revision,
    schedulerVersion: row.scheduler_version,
    configVersion: row.config_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: toState(row),
  };
}

export function createSupabaseLearningStateRepository(
  client: SupabaseClient<Database>,
): LearningStateRepository {
  return {
    async getByItem({ ownerId, practiceItemId }) {
      const { data, error } = await client
        .from("learning_states")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("practice_item_id", practiceItemId)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "no se pudo leer el estado de memoria");
      return data ? toStored(data) : null;
    },

    async findPracticeItem({ ownerId, practiceItemId }) {
      const { data, error } = await client
        .from("practice_items")
        .select("id, archived_at")
        .eq("owner_id", ownerId)
        .eq("id", practiceItemId)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "no se pudo leer el ítem de práctica");
      if (!data) return null;
      return { id: data.id, archivedAt: data.archived_at };
    },

    async create({ ownerId, practiceItemId, state, schedulerVersion, configVersion }) {
      const { data, error } = await client
        .from("learning_states")
        .insert({
          owner_id: ownerId,
          practice_item_id: practiceItemId,
          due_at: state.dueAt.toISOString(),
          stability: state.stability,
          difficulty: state.difficulty,
          scheduled_days: state.scheduledDays,
          learning_step: state.learningStep,
          reps: state.reps,
          lapses: state.lapses,
          phase: state.phase,
          last_reviewed_at: state.lastReviewedAt ? state.lastReviewedAt.toISOString() : null,
          scheduler_version: schedulerVersion,
          config_version: configVersion,
        })
        .select("*")
        .single();
      if (error) throw studyErrorFrom(error, "no se pudo crear el estado de memoria");
      return toStored(data);
    },
  };
}
