import { describe, expect, it } from "vitest";

import { estimateStudyTime } from "./study-time-estimate";

describe("estimateStudyTime", () => {
  it("uses a marked 30-second fallback until five valid samples exist", () => {
    expect(estimateStudyTime(4, [1000, 2000, 3000, 4000])).toEqual({
      source: "fallback",
      sampleSize: 4,
      perReviewMs: 30_000,
      totalMs: 120_000,
    });
    expect(estimateStudyTime(1, [])).toMatchObject({ source: "fallback", totalMs: 30_000 });
  });

  it("uses the median rather than the mean when an attempt is very slow", () => {
    expect(estimateStudyTime(10, [10_000, 20_000, 30_000, 40_000, 3_600_000])).toEqual({
      source: "history",
      sampleSize: 5,
      perReviewMs: 30_000,
      totalMs: 300_000,
    });
  });

  it("averages the middle pair for an even sample", () => {
    expect(estimateStudyTime(2, [60_000, 10_000, 20_000, 30_000, 40_000, 50_000])).toMatchObject({
      source: "history",
      perReviewMs: 35_000,
      totalMs: 70_000,
    });
  });

  it("ignores missing, zero, negative, non-finite and out-of-range durations", () => {
    expect(estimateStudyTime(1, [null, 0, -1, NaN, Infinity, 3_600_001, 1000])).toEqual({
      source: "fallback",
      sampleSize: 1,
      perReviewMs: 30_000,
      totalMs: 30_000,
    });
  });

  it("bounds the sample to the newest 100 valid durations", () => {
    expect(
      estimateStudyTime(1, [
        ...Array<number>(100).fill(12_000),
        ...Array<number>(101).fill(90_000),
      ]),
    ).toMatchObject({
      source: "history",
      sampleSize: 100,
      perReviewMs: 12_000,
    });
  });

  it("estimates no study time when the available queue is empty", () => {
    expect(estimateStudyTime(0, [])).toMatchObject({ totalMs: 0 });
  });
});
