/**
 * Adaptador de `SpacedRepetitionScheduler` sobre `ts-fsrs@5.4.2` (LEX-5.2).
 *
 * Traduce campo a campo. No serializa un `Card` a la base. `elapsed_days`
 * está deprecado en la librería (se va en 6.0): se envía `0` y se deja
 * que `next` use `last_review` + `now`. Este archivo es la única frontera
 * con `ts-fsrs` en `src/` (regla de capas).
 */

import {
  Rating,
  State,
  type Card,
  type CardInput,
  type Grade,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from "ts-fsrs";

import type { SpacedRepetitionScheduler } from "@/modules/study/application/spaced-repetition-scheduler";
import {
  type LearningState,
  type MemoryPhase,
  type ReviewRating,
  REVIEW_RATINGS,
} from "@/modules/study/domain/memory";
import type { SchedulerConfig } from "@/modules/study/domain/scheduler-config";

const PHASE_TO_STATE: Record<MemoryPhase, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const STATE_TO_PHASE: Record<State, MemoryPhase> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const RATING_TO_GRADE: Record<ReviewRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const GRADE_TO_RATING: Record<Grade, ReviewRating> = {
  [Rating.Again]: "again",
  [Rating.Hard]: "hard",
  [Rating.Good]: "good",
  [Rating.Easy]: "easy",
};

function toFsrsParams(config: SchedulerConfig) {
  return generatorParameters({
    request_retention: config.requestedRetention,
    maximum_interval: config.maximumIntervalDays,
    enable_fuzz: config.enableFuzz,
    enable_short_term: config.enableShortTerm,
    learning_steps: [...config.learningSteps],
    relearning_steps: [...config.relearningSteps],
  });
}

function toCard(state: LearningState): CardInput {
  return {
    due: state.dueAt,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: 0,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningStep,
    reps: state.reps,
    lapses: state.lapses,
    state: PHASE_TO_STATE[state.phase],
    last_review: state.lastReviewedAt,
  };
}

function fromCard(card: Card): LearningState {
  return {
    phase: STATE_TO_PHASE[card.state],
    dueAt: card.due,
    lastReviewedAt: card.last_review ?? null,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningStep: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
  };
}

export function createTsFsrsScheduler(): SpacedRepetitionScheduler {
  return {
    createInitialState(now, _config) {
      return fromCard(createEmptyCard(now));
    },

    preview(state, now, config) {
      const scheduler = fsrs(toFsrsParams(config));
      const preview = scheduler.repeat(toCard(state), now);
      return REVIEW_RATINGS.map((rating) => ({
        rating,
        state: fromCard(preview[RATING_TO_GRADE[rating]].card),
      }));
    },

    review(state, rating, now, config) {
      const scheduler = fsrs(toFsrsParams(config));
      const result = scheduler.next(toCard(state), now, RATING_TO_GRADE[rating]);
      const logged = result.log.rating;
      if (logged === Rating.Manual) {
        throw new Error("ts-fsrs devolvió Rating.Manual; Lexora no lo usa como valoración");
      }
      return {
        state: fromCard(result.card),
        rating: GRADE_TO_RATING[logged],
        reviewedAt: result.log.review,
      };
    },
  };
}
