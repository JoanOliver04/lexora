/**
 * Estado de memoria y valoraciones de repaso (LEX-5.2, ADR-003).
 *
 * Lógica pura: sin `ts-fsrs`, sin React, sin base de datos. El adaptador
 * traduce estos tipos a `Card`/`Rating`/`State` de la librería. La fila
 * persistida (`owner_id`, `practice_item_id`, `revision`) llega en LEX-5.4.
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
