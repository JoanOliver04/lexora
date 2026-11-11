import { MEMORY_PHASES, REVIEW_RATINGS, type MemoryPhase, type ReviewRating } from "./memory";
import { isIanaTimeZone, studyDayWindow } from "./study-day";
import { estimateStudyTime } from "./study-time-estimate";
import { isDifficultItem } from "./difficult-item";

export interface StatisticsData {
  byKind: StatisticsBreakdown[];
  byLevel: StatisticsBreakdown[];
  activity: {
    day: string;
    rating: ReviewRating;
    count: number;
    durationMs: number;
    measured: number;
  }[];
  states: { phase: MemoryPhase; count: number }[];
  lapses: number;
  overdue: number;
  forecast: { day: string; count: number }[];
  difficult: {
    id: string;
    conceptId: string;
    mode: string;
    title: string;
    lapses: number;
    recentAgain: number;
  }[];
  difficultTotal: number;
  durations: number[];
}

export interface StatisticsBreakdown {
  key: string;
  states: Record<MemoryPhase, number>;
  reviews: number;
}

export function statisticsDay(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}

export function statisticsWindows(now: Date, timeZone: string, days: number) {
  if (!isIanaTimeZone(timeZone) || ![7, 30, 90].includes(days))
    throw new Error("Invalid statistics period");
  const windows = [];
  let cursor = now;
  for (let i = 0; i < days; i++) {
    const window = studyDayWindow(cursor, timeZone);
    windows.push({ ...window, day: statisticsDay(window.start, timeZone) });
    cursor = new Date(window.start.getTime() - 1);
  }
  return windows.reverse();
}

export function summarizeStatistics(
  data: StatisticsData,
  now: Date,
  timeZone: string,
  days: number,
) {
  const ratings = Object.fromEntries(REVIEW_RATINGS.map((rating) => [rating, 0])) as Record<
    ReviewRating,
    number
  >;
  const states = Object.fromEntries(MEMORY_PHASES.map((phase) => [phase, 0])) as Record<
    MemoryPhase,
    number
  >;
  const activity = statisticsWindows(now, timeZone, days).map((window) => ({
    ...window,
    reviews: 0,
    durationMs: 0,
    measured: 0,
  }));
  const byDay = new Map(activity.map((day) => [day.day, day]));
  for (const row of data.activity) {
    const day = byDay.get(row.day);
    if (!day) continue;
    ratings[row.rating] += row.count;
    day.reviews += row.count;
    day.durationMs += row.durationMs;
    day.measured += row.measured;
  }
  for (const row of data.states) states[row.phase] += row.count;
  const totals = activity.reduce(
    (sum, day) => ({
      reviews: sum.reviews + day.reviews,
      durationMs: sum.durationMs + day.durationMs,
      measured: sum.measured + day.measured,
    }),
    { reviews: 0, durationMs: 0, measured: 0 },
  );
  const forecast = [];
  let next = now;
  for (let i = 0; i < 7; i++) {
    const window = studyDayWindow(next, timeZone);
    const day = statisticsDay(window.start, timeZone);
    forecast.push({
      day,
      start: window.start,
      count: data.forecast.find((row) => row.day === day)?.count ?? 0,
    });
    next = window.end;
  }
  return {
    byKind: data.byKind,
    byLevel: data.byLevel,
    ratings,
    states,
    activity,
    totals,
    forecast,
    observedRecall: totals.reviews > 0 ? (totals.reviews - ratings.again) / totals.reviews : null,
    lapses: data.lapses,
    overdue: data.overdue,
    difficultTotal: data.difficultTotal,
    difficult: data.difficult.filter((item) =>
      isDifficultItem(
        item.lapses,
        Array.from({ length: item.recentAgain }, () => "again" as const),
      ),
    ),
    estimate: estimateStudyTime(data.overdue, data.durations),
  };
}
