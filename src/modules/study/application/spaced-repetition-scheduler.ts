/**
 * Puerto del planificador de repetición espaciada (LEX-5.2, ADR-003).
 *
 * Aísla `ts-fsrs`: ningún caso de uso ni el dominio importan la librería.
 * El reloj se pasa como `now` (LEX-5.12 centralizará un `Clock`); el
 * adaptador no llama a `Date.now()`.
 */

import type {
  LearningState,
  RatingPreview,
  ReviewRating,
  ReviewTransition,
} from "@/modules/study/domain/memory";
import type { SchedulerConfig } from "@/modules/study/domain/scheduler-config";

export interface SpacedRepetitionScheduler {
  createInitialState(now: Date, config: SchedulerConfig): LearningState;
  preview(state: LearningState, now: Date, config: SchedulerConfig): RatingPreview[];
  review(
    state: LearningState,
    rating: ReviewRating,
    now: Date,
    config: SchedulerConfig,
  ): ReviewTransition;
}
