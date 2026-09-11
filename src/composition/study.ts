import type { DailyQueueRepository } from "@/modules/study/application/daily-queue";
import type { LearningStateRepository } from "@/modules/study/application/learning-state";
import type { SpacedRepetitionScheduler } from "@/modules/study/application/spaced-repetition-scheduler";
import { createSupabaseDailyQueueRepository } from "@/modules/study/infrastructure/supabase-daily-queue-repository";
import { createSupabaseLearningStateRepository } from "@/modules/study/infrastructure/supabase-learning-state-repository";
import { createTsFsrsScheduler } from "@/modules/study/infrastructure/ts-fsrs-scheduler";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

/**
 * Raíz de composición del módulo `study` (LEX-5.2, LEX-5.6, LEX-5.7).
 *
 * `src/composition/` es el único sitio que conoce a la vez los puertos y
 * `ts-fsrs` / Supabase. El planificador no necesita identidad; el
 * repositorio de estados y la cola sí.
 */
export function createSpacedRepetitionScheduler(): SpacedRepetitionScheduler {
  return createTsFsrsScheduler();
}

export interface StudyContext {
  ownerId: string;
  learningStates: LearningStateRepository;
  dailyQueue: DailyQueueRepository;
  scheduler: SpacedRepetitionScheduler;
}

export async function getStudyContextForCurrentUser(): Promise<StudyContext | null> {
  const client = await createSupabaseServerClient();

  const { data, error } = await client.auth.getClaims();
  const ownerId = data?.claims.sub;
  if (error || !ownerId) {
    return null;
  }

  return {
    ownerId,
    learningStates: createSupabaseLearningStateRepository(client),
    dailyQueue: createSupabaseDailyQueueRepository(client),
    scheduler: createTsFsrsScheduler(),
  };
}
