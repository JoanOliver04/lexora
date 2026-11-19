import type { ReviewCommitter } from "@/modules/study/application/confirm-review";
import type { DailyQueueRepository } from "@/modules/study/application/daily-queue";
import type { LearningStateRepository } from "@/modules/study/application/learning-state";
import type { SpacedRepetitionScheduler } from "@/modules/study/application/spaced-repetition-scheduler";
import type { TodayOverviewRepository } from "@/modules/study/application/today-overview";
import type { TodayDashboardRepository } from "@/modules/study/application/today-dashboard";
import type { StudySessionRepository } from "@/modules/study/application/study-session";
import type { StudyCardRepository } from "@/modules/study/application/study-card";
import type { SessionHistoryRepository } from "@/modules/study/application/session-summary";
import { createSupabaseDailyQueueRepository } from "@/modules/study/infrastructure/supabase-daily-queue-repository";
import { createSupabaseLearningStateRepository } from "@/modules/study/infrastructure/supabase-learning-state-repository";
import { createSupabaseReviewCommitter } from "@/modules/study/infrastructure/supabase-review-committer";
import { createTsFsrsScheduler } from "@/modules/study/infrastructure/ts-fsrs-scheduler";
import { createSupabaseTodayOverviewRepository } from "@/modules/study/infrastructure/supabase-today-overview-repository";
import { createSupabaseTodayDashboardRepository } from "@/modules/study/infrastructure/supabase-today-dashboard-repository";
import { createSupabaseStudySessionRepository } from "@/modules/study/infrastructure/supabase-study-session-repository";
import {
  createSupabaseStudyCardRepository,
  listFreeStudyCards,
} from "@/modules/study/infrastructure/supabase-study-card-repository";
import { listEligibleStudyItemIds } from "@/modules/study/infrastructure/supabase-eligible-study-items";
import { createSupabaseSessionHistoryRepository } from "@/modules/study/infrastructure/supabase-session-history-repository";
import type { Clock } from "@/shared/application/clock";
import { createSystemClock } from "@/shared/infrastructure/system-clock";
import { getWorkspaceProfileForCurrentUser } from "./courses";
import { getAuthenticatedUser } from "./identity";

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

/** One request key per setup form, retained when the user retries creation. */
export function createStudySessionId(): string {
  return crypto.randomUUID();
}

/** Mint a key only after an authorized reveal; retain it for the same intent. */
export function createReviewIdempotencyKey(): string {
  return crypto.randomUUID();
}

export interface StudyContext {
  ownerId: string;
  courseId: string;
  timeZone: string;
  clock: Clock;
  learningStates: LearningStateRepository;
  dailyQueue: DailyQueueRepository;
  todayOverview: TodayOverviewRepository;
  todayDashboard: TodayDashboardRepository;
  sessions: StudySessionRepository;
  cards: StudyCardRepository;
  scheduler: SpacedRepetitionScheduler;
  reviewCommitter: ReviewCommitter;
  sessionHistory: SessionHistoryRepository;
}

export async function getStudyContextForCurrentUser(): Promise<StudyContext | null> {
  const [user, profile] = await Promise.all([
    getAuthenticatedUser(),
    getWorkspaceProfileForCurrentUser(),
  ]);
  if (!user || !profile?.course) return null;
  const { client, ownerId } = user;
  const { course, timeZone } = profile;

  return {
    ownerId,
    courseId: course.id,
    timeZone,
    clock: createSystemClock(),
    learningStates: createSupabaseLearningStateRepository(client),
    dailyQueue: createSupabaseDailyQueueRepository(client),
    todayOverview: createSupabaseTodayOverviewRepository(client),
    todayDashboard: createSupabaseTodayDashboardRepository(client),
    sessions: createSupabaseStudySessionRepository(client, course.id),
    cards: createSupabaseStudyCardRepository(client),
    scheduler: createTsFsrsScheduler(),
    reviewCommitter: createSupabaseReviewCommitter(client),
    sessionHistory: createSupabaseSessionHistoryRepository(client),
  };
}

export async function getFreeStudyContextForCurrentUser() {
  const [user, profile] = await Promise.all([
    getAuthenticatedUser(),
    getWorkspaceProfileForCurrentUser(),
  ]);
  if (!user || !profile?.course) return null;
  const { client, ownerId } = user;
  const scope = { ownerId, courseId: profile.course.id };
  return {
    courseId: scope.courseId,
    listDecks: () => createSupabaseTodayDashboardRepository(client).listActiveDecks(scope),
    listItemIds: (deckIds: string[] | null) =>
      listEligibleStudyItemIds(client, { ...scope, deckIds }),
    readCards: (itemIds: string[]) => listFreeStudyCards(client, scope, itemIds),
  };
}
