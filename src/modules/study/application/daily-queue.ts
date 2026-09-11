/**
 * Puerto y caso de uso de la cola diaria (LEX-5.7).
 *
 * El dominio ordena; aquí se cargan candidatos ya filtrados (curso, mazos
 * activos, conceptos e ítems no archivados, enabled) y los cupos de hoy.
 * No crea `LearningState`: un New sin fila aparece con `learningStateId`
 * nulo; `ensureLearningState` (LEX-5.6) llega al estudiar.
 *
 * Q-006 opción 1: archivar un concepto no cascada a sus ítems; la cola
 * los deja fuera leyendo `concepts.archived_at`.
 *
 * `dayStart`/`dayEnd` son el día de estudio en UTC (fin exclusivo).
 * LEX-5.12 calculará esa ventana con la zona IANA del perfil.
 */

import {
  assembleDailyQueue,
  type DailyQueue,
  type QueueCandidate,
} from "@/modules/study/domain/queue";

export type {
  DailyQueue,
  QueueCandidate,
  QueueEntry,
  QueueGroup,
} from "@/modules/study/domain/queue";

export interface CourseStudyLimits {
  dailyNewLimit: number;
  maximumReviewsPerDay: number | null;
}

export interface TodayStudyActivity {
  newIntroduced: number;
  reviewsDone: number;
}

export interface DailyQueueRepository {
  getCourseLimits(input: { ownerId: string; courseId: string }): Promise<CourseStudyLimits | null>;
  listEligibleItems(input: {
    ownerId: string;
    courseId: string;
    deckIds: string[] | null;
  }): Promise<QueueCandidate[]>;
  countTodayActivity(input: {
    ownerId: string;
    dayStart: Date;
    dayEnd: Date;
  }): Promise<TodayStudyActivity>;
}

export type GetDailyQueueResult =
  { ok: true; queue: DailyQueue } | { ok: false; reason: "not-found" };

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de estudio invocado sin identificador de usuario");
  }
}

export async function getDailyQueue(
  repository: DailyQueueRepository,
  input: {
    ownerId: string;
    courseId: string;
    deckIds?: string[] | null;
    now: Date;
    dayStart: Date;
    dayEnd: Date;
  },
): Promise<GetDailyQueueResult> {
  assertUserId(input.ownerId);

  const limits = await repository.getCourseLimits({
    ownerId: input.ownerId,
    courseId: input.courseId,
  });
  if (!limits) {
    return { ok: false, reason: "not-found" };
  }

  const deckIds = input.deckIds === undefined ? null : input.deckIds;
  const [candidates, today] = await Promise.all([
    repository.listEligibleItems({
      ownerId: input.ownerId,
      courseId: input.courseId,
      deckIds,
    }),
    repository.countTodayActivity({
      ownerId: input.ownerId,
      dayStart: input.dayStart,
      dayEnd: input.dayEnd,
    }),
  ]);

  return {
    ok: true,
    queue: assembleDailyQueue({
      candidates,
      now: input.now,
      dailyNewLimit: limits.dailyNewLimit,
      newIntroducedToday: today.newIntroduced,
      maximumReviewsPerDay: limits.maximumReviewsPerDay,
      reviewsDoneToday: today.reviewsDone,
    }),
  };
}
