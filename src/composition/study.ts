import type { ReviewCommitter } from "@/modules/study/application/confirm-review";
import type { DailyQueueRepository } from "@/modules/study/application/daily-queue";
import type { LearningStateRepository } from "@/modules/study/application/learning-state";
import type { SpacedRepetitionScheduler } from "@/modules/study/application/spaced-repetition-scheduler";
import { DEFAULT_STUDY_TIMEZONE } from "@/modules/study/domain/study-day";
import { createSupabaseDailyQueueRepository } from "@/modules/study/infrastructure/supabase-daily-queue-repository";
import { createSupabaseLearningStateRepository } from "@/modules/study/infrastructure/supabase-learning-state-repository";
import { createSupabaseReviewCommitter } from "@/modules/study/infrastructure/supabase-review-committer";
import { createTsFsrsScheduler } from "@/modules/study/infrastructure/ts-fsrs-scheduler";
import type { Clock } from "@/shared/application/clock";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
import { createSystemClock } from "@/shared/infrastructure/system-clock";

/**
 * Raíz de composición del módulo `study` (LEX-5.2, LEX-5.6, LEX-5.7,
 * LEX-5.9, LEX-5.12).
 *
 * `src/composition/` es el único sitio que conoce a la vez los puertos y
 * `ts-fsrs` / Supabase. El planificador no necesita identidad; el
 * repositorio de estados, la cola, el committer y el reloj sí.
 */
export function createSpacedRepetitionScheduler(): SpacedRepetitionScheduler {
  return createTsFsrsScheduler();
}

export interface StudyContext {
  ownerId: string;
  timeZone: string;
  clock: Clock;
  learningStates: LearningStateRepository;
  dailyQueue: DailyQueueRepository;
  scheduler: SpacedRepetitionScheduler;
  reviewCommitter: ReviewCommitter;
}

export async function getStudyContextForCurrentUser(): Promise<StudyContext | null> {
  const client = await createSupabaseServerClient();

  const { data, error } = await client.auth.getClaims();
  const ownerId = data?.claims.sub;
  if (error || !ownerId) {
    return null;
  }

  const dailyQueue = createSupabaseDailyQueueRepository(client);
  const timeZone = (await dailyQueue.getTimeZone({ ownerId })) ?? DEFAULT_STUDY_TIMEZONE;

  return {
    ownerId,
    timeZone,
    clock: createSystemClock(),
    learningStates: createSupabaseLearningStateRepository(client),
    dailyQueue,
    scheduler: createTsFsrsScheduler(),
    reviewCommitter: createSupabaseReviewCommitter(client),
  };
}
