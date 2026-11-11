import { describe, expect, it } from "vitest";
import { summarizeSessionReviews, type SessionReviewRecord } from "./session-summary";

const record: SessionReviewRecord = {
  id: "log-1",
  practiceItemId: "item-1",
  rating: "good",
  phaseBefore: "new",
  durationMs: 10_000,
};
describe("summarizeSessionReviews", () => {
  it("counts confirmed events separately from distinct newly introduced items", () => {
    expect(
      summarizeSessionReviews([
        { ...record, rating: "again" },
        { ...record, id: "log-2", phaseBefore: "learning", rating: "hard", durationMs: 20_000 },
        { ...record, id: "log-3", practiceItemId: "item-2", durationMs: null },
        { ...record, id: "log-4", phaseBefore: "review", rating: "easy", durationMs: null },
      ]),
    ).toEqual({
      reviewCount: 4,
      newItemCount: 2,
      unclassifiedCount: 0,
      ratings: { again: 1, hard: 1, good: 1, easy: 1 },
      recordedDurationMs: 30_000,
      timedReviewCount: 2,
    });
  });
  it("does not double-count a receipt or an item introduced again in legacy data", () => {
    expect(summarizeSessionReviews([record, record, { ...record, id: "log-2" }])).toMatchObject({
      reviewCount: 2,
      newItemCount: 1,
      recordedDurationMs: 20_000,
      timedReviewCount: 2,
    });
  });
  it("reports unknown snapshots without inventing a new item", () => {
    expect(summarizeSessionReviews([{ ...record, phaseBefore: null }])).toMatchObject({
      reviewCount: 1,
      newItemCount: 0,
      unclassifiedCount: 1,
    });
  });
  it("distinguishes missing duration from a recorded zero, including an empty session", () => {
    expect(summarizeSessionReviews([])).toEqual({
      reviewCount: 0,
      newItemCount: 0,
      unclassifiedCount: 0,
      ratings: { again: 0, hard: 0, good: 0, easy: 0 },
      recordedDurationMs: null,
      timedReviewCount: 0,
    });
    expect(
      summarizeSessionReviews([{ ...record, durationMs: null }]).recordedDurationMs,
    ).toBeNull();
    expect(summarizeSessionReviews([{ ...record, durationMs: 0 }])).toMatchObject({
      recordedDurationMs: 0,
      timedReviewCount: 1,
    });
  });
  it.each([-1, NaN, Infinity, 1.5, 3_600_001])(
    "does not treat invalid duration %s as studied time",
    (durationMs) => {
      expect(summarizeSessionReviews([{ ...record, durationMs }])).toMatchObject({
        recordedDurationMs: null,
        timedReviewCount: 0,
        reviewCount: 1,
      });
    },
  );
  it("accepts the stored duration boundary without using a fallback or wall clock", () => {
    expect(summarizeSessionReviews([{ ...record, durationMs: 3_600_000 }])).toMatchObject({
      recordedDurationMs: 3_600_000,
      timedReviewCount: 1,
    });
  });
});
