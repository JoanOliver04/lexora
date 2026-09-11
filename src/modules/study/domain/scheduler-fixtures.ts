/**
 * Transiciones congeladas v1 (LEX-5.13).
 *
 * Números de `ts-fsrs@5.4.2` con fuzz apagado y reloj
 * `2026-09-11T10:00:00.000Z`. Si un upgrade los cambia, el test de
 * reconstrucción falla: no se aflojan las aserciones; se abre un ADR.
 */

import type { LearningStateSnapshot, ReviewRating } from "./memory";
import { SCHEDULER_CONFIG_VERSION, SCHEDULER_PACKAGE_VERSION } from "./scheduler-config";

export interface FrozenSchedulerTransition {
  id: string;
  schedulerPackageVersion: string;
  configVersion: string;
  enableFuzz: false;
  reviewedAt: string;
  rating: ReviewRating;
  before: LearningStateSnapshot;
  after: LearningStateSnapshot;
}

const NOW = "2026-09-11T10:00:00.000Z";

const NEW_BEFORE: LearningStateSnapshot = {
  phase: "new",
  dueAt: NOW,
  lastReviewedAt: null,
  stability: 0,
  difficulty: 0,
  scheduledDays: 0,
  learningStep: 0,
  reps: 0,
  lapses: 0,
};

export const V1_FROZEN_NEW_GOOD: FrozenSchedulerTransition = {
  id: "new-good-fuzz-off",
  schedulerPackageVersion: SCHEDULER_PACKAGE_VERSION,
  configVersion: SCHEDULER_CONFIG_VERSION,
  enableFuzz: false,
  reviewedAt: NOW,
  rating: "good",
  before: NEW_BEFORE,
  after: {
    phase: "learning",
    dueAt: "2026-09-11T10:10:00.000Z",
    lastReviewedAt: NOW,
    stability: 2.3065,
    difficulty: 2.11810397,
    scheduledDays: 0,
    learningStep: 1,
    reps: 1,
    lapses: 0,
  },
};

export const V1_FROZEN_NEW_EASY: FrozenSchedulerTransition = {
  id: "new-easy-fuzz-off",
  schedulerPackageVersion: SCHEDULER_PACKAGE_VERSION,
  configVersion: SCHEDULER_CONFIG_VERSION,
  enableFuzz: false,
  reviewedAt: NOW,
  rating: "easy",
  before: NEW_BEFORE,
  after: {
    phase: "review",
    dueAt: "2026-09-19T10:00:00.000Z",
    lastReviewedAt: NOW,
    stability: 8.2956,
    difficulty: 1,
    scheduledDays: 8,
    learningStep: 0,
    reps: 1,
    lapses: 0,
  },
};

export const V1_FROZEN_TRANSITIONS: readonly FrozenSchedulerTransition[] = [
  V1_FROZEN_NEW_GOOD,
  V1_FROZEN_NEW_EASY,
];
