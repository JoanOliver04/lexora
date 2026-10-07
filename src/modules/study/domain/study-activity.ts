import type { MemoryPhase } from "./memory";
import { studyDayWindow, type StudyDayWindow } from "./study-day";
import { MAX_REVIEW_DURATION_MS } from "./study-time-estimate";

export interface StudyActivityReview {
  id: string;
  practiceItemId: string;
  reviewedAt: Date;
  phaseBefore: MemoryPhase | null;
  durationMs: number | null;
}

export interface StudyActivityTotals {
  reviews: number;
  newIntroduced: number;
  durationMs: number;
  measuredReviews: number;
}

export interface StudyActivityDay extends StudyActivityTotals, StudyDayWindow {}

export function recentStudyDays(now: Date, timeZone: string): StudyDayWindow[] {
  const days: StudyDayWindow[] = [];
  let cursor = now;
  for (let index = 0; index < 7; index++) {
    const day = studyDayWindow(cursor, timeZone);
    days.push(day);
    // Walk calendar days across DST, rather than subtracting 24 hours.
    cursor = new Date(day.start.getTime() - 1);
  }
  return days.reverse();
}

export function summarizeStudyActivity(
  windows: readonly StudyDayWindow[],
  reviews: readonly StudyActivityReview[],
  now: Date,
): { days: StudyActivityDay[]; totals: StudyActivityTotals } {
  const unique = [...new Map(reviews.map((review) => [review.id, review])).values()];
  const days = windows.map((window): StudyActivityDay => {
    const attempts = unique.filter(
      (review) =>
        review.reviewedAt >= window.start &&
        review.reviewedAt < window.end &&
        review.reviewedAt <= now,
    );
    const newItems = new Set(
      attempts
        .filter((review) => review.phaseBefore === "new")
        .map((review) => review.practiceItemId),
    );
    const durations = attempts
      .map((review) => review.durationMs)
      .filter(
        (value): value is number =>
          value !== null && Number.isFinite(value) && value >= 0 && value <= MAX_REVIEW_DURATION_MS,
      );
    return {
      ...window,
      reviews: attempts.length,
      newIntroduced: newItems.size,
      durationMs: durations.reduce((sum, value) => sum + value, 0),
      measuredReviews: durations.length,
    };
  });
  const totals = days.reduce<StudyActivityTotals>(
    (sum, day) => ({
      reviews: sum.reviews + day.reviews,
      newIntroduced: sum.newIntroduced + day.newIntroduced,
      durationMs: sum.durationMs + day.durationMs,
      measuredReviews: sum.measuredReviews + day.measuredReviews,
    }),
    { reviews: 0, newIntroduced: 0, durationMs: 0, measuredReviews: 0 },
  );
  return { days, totals };
}
