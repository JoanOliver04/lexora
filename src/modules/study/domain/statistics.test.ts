import { describe, expect, it } from "vitest";
import { statisticsWindows, summarizeStatistics, type StatisticsData } from "./statistics";
const now = new Date("2026-10-25T12:00:00Z");
const empty = (): StatisticsData => ({
  byKind: [],
  byLevel: [],
  activity: [],
  states: [],
  lapses: 0,
  overdue: 0,
  forecast: [],
  difficult: [],
  difficultTotal: 0,
  durations: [],
});

describe("Explainable study statistics", () => {
  it("returns no percentage or recorded time for no attempts", () => {
    const s = summarizeStatistics(empty(), now, "Europe/Madrid", 7);
    expect(s.observedRecall).toBeNull();
    expect(s.totals).toEqual({ reviews: 0, durationMs: 0, measured: 0 });
    expect(s.activity).toHaveLength(7);
    expect(s.forecast).toHaveLength(7);
  });
  it("counts all attempts, separates Again and only totals measured durations", () => {
    const data = empty();
    data.activity = [
      { day: "2026-10-25", rating: "again", count: 2, durationMs: 10000, measured: 1 },
      { day: "2026-10-25", rating: "hard", count: 1, durationMs: 20000, measured: 1 },
      { day: "2026-10-24", rating: "good", count: 2, durationMs: 40000, measured: 2 },
      { day: "2026-10-23", rating: "easy", count: 3, durationMs: 0, measured: 0 },
      { day: "2026-10-26", rating: "good", count: 100, durationMs: 0, measured: 0 },
    ];
    const s = summarizeStatistics(data, now, "Europe/Madrid", 7);
    expect(s.totals).toEqual({ reviews: 8, durationMs: 70000, measured: 4 });
    expect(s.observedRecall).toBe(0.75);
    expect(s.ratings).toEqual({ again: 2, hard: 1, good: 2, easy: 3 });
  });
  it("walks civil days through DST and separates overdue from future forecast", () => {
    const windows = statisticsWindows(now, "Europe/Madrid", 7);
    expect(windows.at(-1)!.day).toBe("2026-10-25");
    expect(windows.at(-1)!.end.getTime() - windows.at(-1)!.start.getTime()).toBe(25 * 3600000);
    const data = { ...empty(), overdue: 4, forecast: [{ day: "2026-10-26", count: 3 }] };
    const s = summarizeStatistics(data, now, "Europe/Madrid", 7);
    expect(s.forecast.map((d) => d.count)).toEqual([0, 3, 0, 0, 0, 0, 0]);
    expect(s.overdue).toBe(4);
    expect(s.estimate.source).toBe("fallback");
    expect(s.estimate.totalMs).toBe(120000);
  });
  it("uses the shared difficulty rule and a personal duration median", () => {
    const data = empty();
    data.overdue = 2;
    data.durations = [5000, 10000, 15000, 20000, 3000000];
    data.difficult = [
      { id: "a", conceptId: "c", title: "A", mode: "basic_recall", lapses: 3, recentAgain: 0 },
      { id: "b", conceptId: "c", title: "B", mode: "basic_recognition", lapses: 0, recentAgain: 2 },
      { id: "c", conceptId: "c", title: "C", mode: "cloze", lapses: 0, recentAgain: 1 },
    ];
    const s = summarizeStatistics(data, now, "Europe/Madrid", 30);
    expect(s.difficult.map((i) => i.id)).toEqual(["a", "b"]);
    expect(s.estimate.perReviewMs).toBe(15000);
    expect(s.estimate.totalMs).toBe(30000);
  });
});
