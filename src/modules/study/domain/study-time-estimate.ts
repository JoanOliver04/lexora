export const RECENT_DURATION_DAYS = 30;
export const RECENT_DURATION_SAMPLE_LIMIT = 100;
export const MIN_DURATION_SAMPLES = 5;
export const FALLBACK_REVIEW_DURATION_MS = 30_000;
export const MAX_REVIEW_DURATION_MS = 3_600_000;

export interface StudyTimeEstimate {
  source: "history" | "fallback";
  sampleSize: number;
  perReviewMs: number;
  totalMs: number;
}

/** Estimate one pass through the available queue; future repetitions are unknown. */
export function estimateStudyTime(
  availableItems: number,
  recentDurationsMs: readonly (number | null)[],
): StudyTimeEstimate {
  const durations = recentDurationsMs
    .filter(
      (value): value is number =>
        value !== null && Number.isFinite(value) && value > 0 && value <= MAX_REVIEW_DURATION_MS,
    )
    .slice(0, RECENT_DURATION_SAMPLE_LIMIT)
    .sort((a, b) => a - b);
  const sampleSize = durations.length;
  const source = sampleSize >= MIN_DURATION_SAMPLES ? "history" : "fallback";
  let perReviewMs = FALLBACK_REVIEW_DURATION_MS;
  if (source === "history") {
    const middle = Math.floor(sampleSize / 2);
    const upper = durations[middle]!;
    perReviewMs = sampleSize % 2 === 0 ? (durations[middle - 1]! + upper) / 2 : upper;
  }
  return { source, sampleSize, perReviewMs, totalMs: availableItems * perReviewMs };
}
