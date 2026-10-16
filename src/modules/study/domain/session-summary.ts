import { REVIEW_RATINGS, type MemoryPhase, type ReviewRating } from "./memory";
import { MAX_REVIEW_DURATION_MS } from "./study-time-estimate";

/** A minimal historical projection, never live card content or a prediction. */
export interface SessionReviewRecord {
  id: string;
  practiceItemId: string;
  rating: ReviewRating;
  phaseBefore: MemoryPhase | null;
  durationMs: number | null;
}

export interface SessionReviewTotals {
  reviewCount: number;
  newItemCount: number;
  unclassifiedCount: number;
  ratings: Record<ReviewRating, number>;
  recordedDurationMs: number | null;
  timedReviewCount: number;
}

export function summarizeSessionReviews(
  records: readonly SessionReviewRecord[],
): SessionReviewTotals {
  const seen = new Set<string>();
  const introduced = new Set<string>();
  const ratings: Record<ReviewRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  let unclassifiedCount = 0;
  let durationMs = 0;
  let timedReviewCount = 0;
  for (const record of records) {
    if (seen.has(record.id)) continue;
    seen.add(record.id);
    ratings[record.rating] += 1;
    if (record.phaseBefore === "new") introduced.add(record.practiceItemId);
    if (record.phaseBefore === null) unclassifiedCount += 1;
    if (
      record.durationMs !== null &&
      Number.isInteger(record.durationMs) &&
      record.durationMs >= 0 &&
      record.durationMs <= MAX_REVIEW_DURATION_MS
    ) {
      durationMs += record.durationMs;
      timedReviewCount += 1;
    }
  }
  return {
    reviewCount: REVIEW_RATINGS.reduce((count, rating) => count + ratings[rating], 0),
    newItemCount: introduced.size,
    unclassifiedCount,
    ratings,
    recordedDurationMs: timedReviewCount === 0 ? null : durationMs,
    timedReviewCount,
  };
}
