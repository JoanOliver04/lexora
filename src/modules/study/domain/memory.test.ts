import { describe, expect, it } from "vitest";

import { MEMORY_PHASES, REVIEW_RATINGS, isMemoryPhase, isReviewRating } from "./memory";

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
