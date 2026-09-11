/**
 * Cola diaria (LEX-5.7, MASTER_SPEC §14.4).
 *
 * Ordenación pura: sin base de datos, sin `ts-fsrs`. El adaptador trae
 * candidatos ya filtrados (curso, mazos activos, no archivados, enabled);
 * aquí se agrupan, se recortan por límites y se ordenan.
 *
 * Bandas, en este orden:
 *   1. Learning y Relearning vencidos
 *   2. Review vencidos
 *   3. New, hasta el cupo diario de nuevos
 *
 * Dentro de Learning/Review: `dueAt` ascendente, desempate `practiceItemId`.
 * Dentro de New: solo `practiceItemId` (el vencimiento de un New no ordena).
 *
 * El límite de repasos recorta solo Review. Los pasos cortos de
 * Learning/Relearning no consumen ese cupo. Los nuevos se cuentan por
 * `PracticeItem` (ADR-003), no por concepto.
 *
 * El día local (`dayStart`/`dayEnd`) lo inyecta el llamador. LEX-5.12
 * calculará esa ventana con la zona IANA del perfil.
 */

import type { MemoryPhase } from "./memory";

export const QUEUE_GROUPS = ["learning", "review", "new"] as const;
export type QueueGroup = (typeof QUEUE_GROUPS)[number];

/** Candidato ya filtrado por pertenencia; `phase` nulo = aún sin estado. */
export interface QueueCandidate {
  practiceItemId: string;
  dueAt: Date | null;
  phase: MemoryPhase | null;
  learningStateId: string | null;
  revision: number | null;
}

export interface QueueEntry {
  practiceItemId: string;
  group: QueueGroup;
  phase: MemoryPhase | null;
  dueAt: Date | null;
  learningStateId: string | null;
  revision: number | null;
}

export interface DailyQueue {
  entries: QueueEntry[];
  /** Review vencidos que el límite diario deja fuera. */
  hiddenDueReviews: number;
  /** New disponibles que el cupo de nuevos deja fuera. */
  hiddenNew: number;
  /** Huecos de New que aún se pueden introducir hoy. */
  newRemaining: number;
  /** Próximo vencimiento futuro entre los candidatos no vencidos. */
  nextDueAt: Date | null;
}

export interface AssembleDailyQueueInput {
  candidates: readonly QueueCandidate[];
  now: Date;
  dailyNewLimit: number;
  newIntroducedToday: number;
  maximumReviewsPerDay: number | null;
  reviewsDoneToday: number;
}

function byDueThenId(a: QueueCandidate, b: QueueCandidate): number {
  const aDue = a.dueAt ? a.dueAt.getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.dueAt ? b.dueAt.getTime() : Number.POSITIVE_INFINITY;
  if (aDue !== bDue) return aDue - bDue;
  return a.practiceItemId < b.practiceItemId ? -1 : a.practiceItemId > b.practiceItemId ? 1 : 0;
}

function byId(a: QueueCandidate, b: QueueCandidate): number {
  return a.practiceItemId < b.practiceItemId ? -1 : a.practiceItemId > b.practiceItemId ? 1 : 0;
}

function isDue(candidate: QueueCandidate, now: Date): boolean {
  return candidate.dueAt !== null && candidate.dueAt.getTime() <= now.getTime();
}

function toEntry(candidate: QueueCandidate, group: QueueGroup): QueueEntry {
  return {
    practiceItemId: candidate.practiceItemId,
    group,
    phase: candidate.phase,
    dueAt: candidate.dueAt,
    learningStateId: candidate.learningStateId,
    revision: candidate.revision,
  };
}

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

/**
 * Arma la cola del día a partir de candidatos ya filtrados y de los
 * contadores de actividad de hoy. No consulta nada; no crea estados.
 */
export function assembleDailyQueue(input: AssembleDailyQueueInput): DailyQueue {
  const now = input.now;
  const learningDue: QueueCandidate[] = [];
  const reviewDue: QueueCandidate[] = [];
  const availableNew: QueueCandidate[] = [];
  let nextDueAt: Date | null = null;

  for (const candidate of input.candidates) {
    const phase = candidate.phase;
    if (phase === "learning" || phase === "relearning") {
      if (isDue(candidate, now)) {
        learningDue.push(candidate);
      } else if (candidate.dueAt) {
        if (!nextDueAt || candidate.dueAt.getTime() < nextDueAt.getTime()) {
          nextDueAt = candidate.dueAt;
        }
      }
      continue;
    }
    if (phase === "review") {
      if (isDue(candidate, now)) {
        reviewDue.push(candidate);
      } else if (candidate.dueAt) {
        if (!nextDueAt || candidate.dueAt.getTime() < nextDueAt.getTime()) {
          nextDueAt = candidate.dueAt;
        }
      }
      continue;
    }
    // New (con estado) o sin estado todavía.
    availableNew.push(candidate);
  }

  learningDue.sort(byDueThenId);
  reviewDue.sort(byDueThenId);
  availableNew.sort(byId);

  const newRemaining = clampNonNegative(input.dailyNewLimit - input.newIntroducedToday);
  const takenNew = availableNew.slice(0, newRemaining);

  const reviewRemaining =
    input.maximumReviewsPerDay === null
      ? reviewDue.length
      : clampNonNegative(input.maximumReviewsPerDay - input.reviewsDoneToday);
  const takenReview = reviewDue.slice(0, reviewRemaining);

  return {
    entries: [
      ...learningDue.map((c) => toEntry(c, "learning")),
      ...takenReview.map((c) => toEntry(c, "review")),
      ...takenNew.map((c) => toEntry(c, "new")),
    ],
    hiddenDueReviews: reviewDue.length - takenReview.length,
    hiddenNew: availableNew.length - takenNew.length,
    newRemaining: newRemaining - takenNew.length,
    nextDueAt,
  };
}
