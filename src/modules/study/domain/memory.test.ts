import { describe, expect, it } from "vitest";

import {
  MEMORY_PHASES,
  REVIEW_RATINGS,
  isMemoryPhase,
  isReviewRating,
  learningStateFromSnapshot,
  snapshotLearningState,
  type LearningState,
} from "./memory";

describe("isReviewRating", () => {
  it("acepta las cuatro valoraciones de usuario y rechaza Manual", () => {
    for (const rating of REVIEW_RATINGS) {
      expect(isReviewRating(rating)).toBe(true);
    }
    expect(isReviewRating("manual")).toBe(false);
    expect(isReviewRating(1)).toBe(false);
  });
});

describe("isMemoryPhase", () => {
  it("acepta las cuatro fases y rechaza el resto", () => {
    for (const phase of MEMORY_PHASES) {
      expect(isMemoryPhase(phase)).toBe(true);
    }
    expect(isMemoryPhase("New")).toBe(false);
    expect(isMemoryPhase(0)).toBe(false);
  });
});

describe("snapshotLearningState", () => {
  const state: LearningState = {
    phase: "learning",
    dueAt: new Date("2026-09-11T10:10:00.000Z"),
    lastReviewedAt: new Date("2026-09-11T10:00:00.000Z"),
    stability: 2.3065,
    difficulty: 6.4133,
    scheduledDays: 0,
    learningStep: 1,
    reps: 1,
    lapses: 0,
  };

  it("ida y vuelta conserva el estado", () => {
    const snap = snapshotLearningState(state);
    expect(learningStateFromSnapshot(snap)).toEqual(state);
  });

  it("rechaza un JSON incompleto o con fecha no ISO", () => {
    expect(learningStateFromSnapshot({})).toBeNull();
    expect(
      learningStateFromSnapshot({ ...snapshotLearningState(state), dueAt: "nope" }),
    ).toBeNull();
    expect(
      learningStateFromSnapshot({ ...snapshotLearningState(state), lastReviewedAt: "x" }),
    ).toBeNull();
  });
});
