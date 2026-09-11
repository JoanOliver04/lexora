/**
 * Estado de memoria y valoraciones de repaso (LEX-5.2, ADR-003).
 *
 * Lógica pura: sin `ts-fsrs`, sin React, sin base de datos. El adaptador
 * traduce estos tipos a `Card`/`Rating`/`State` de la librería. La fila
 * persistida (`owner_id`, `practice_item_id`, `revision`) vive en
 * `learning_states` (LEX-5.4); este tipo es la instantánea, no esa fila.
 */

export const REVIEW_RATINGS = ["again", "hard", "good", "easy"] as const;
export type ReviewRating = (typeof REVIEW_RATINGS)[number];

export const MEMORY_PHASES = ["new", "learning", "review", "relearning"] as const;
export type MemoryPhase = (typeof MEMORY_PHASES)[number];

/** Instantánea que el planificador lee y escribe. No es la fila de la base. */
export interface LearningState {
  phase: MemoryPhase;
  dueAt: Date;
  lastReviewedAt: Date | null;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningStep: number;
  reps: number;
  lapses: number;
}

export interface RatingPreview {
  rating: ReviewRating;
  state: LearningState;
}

export interface ReviewTransition {
  state: LearningState;
  rating: ReviewRating;
  reviewedAt: Date;
}

export function isReviewRating(value: unknown): value is ReviewRating {
  return typeof value === "string" && (REVIEW_RATINGS as readonly string[]).includes(value);
}

export function isMemoryPhase(value: unknown): value is MemoryPhase {
  return typeof value === "string" && (MEMORY_PHASES as readonly string[]).includes(value);
}

/**
 * Forma JSON del estado en `review_logs.state_before` / `state_after`
 * (LEX-5.13). Fechas en ISO UTC. Reconstruible sin `ts-fsrs`.
 */
export interface LearningStateSnapshot {
  phase: MemoryPhase;
  dueAt: string;
  lastReviewedAt: string | null;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningStep: number;
  reps: number;
  lapses: number;
}

export function snapshotLearningState(state: LearningState): LearningStateSnapshot {
  return {
    phase: state.phase,
    dueAt: state.dueAt.toISOString(),
    lastReviewedAt: state.lastReviewedAt ? state.lastReviewedAt.toISOString() : null,
    stability: state.stability,
    difficulty: state.difficulty,
    scheduledDays: state.scheduledDays,
    learningStep: state.learningStep,
    reps: state.reps,
    lapses: state.lapses,
  };
}

export function learningStateFromSnapshot(raw: unknown): LearningState | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (!isMemoryPhase(value["phase"])) return null;
  if (typeof value["dueAt"] !== "string") return null;
  const dueAt = parseIso(value["dueAt"]);
  if (!dueAt) return null;
  let lastReviewedAt: Date | null = null;
  if (value["lastReviewedAt"] !== null) {
    if (typeof value["lastReviewedAt"] !== "string") return null;
    lastReviewedAt = parseIso(value["lastReviewedAt"]);
    if (!lastReviewedAt) return null;
  }
  if (!isFiniteNumber(value["stability"])) return null;
  if (!isFiniteNumber(value["difficulty"])) return null;
  if (!isNonNegativeInt(value["scheduledDays"])) return null;
  if (!isNonNegativeInt(value["learningStep"])) return null;
  if (!isNonNegativeInt(value["reps"])) return null;
  if (!isNonNegativeInt(value["lapses"])) return null;
  return {
    phase: value["phase"],
    dueAt,
    lastReviewedAt,
    stability: value["stability"],
    difficulty: value["difficulty"],
    scheduledDays: value["scheduledDays"],
    learningStep: value["learningStep"],
    reps: value["reps"],
    lapses: value["lapses"],
  };
}

function parseIso(value: string): Date | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) return null;
  return date;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
