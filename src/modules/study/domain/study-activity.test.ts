import { describe, expect, it } from "vitest";
import {
  recentStudyDays,
  summarizeStudyActivity,
  type StudyActivityReview,
} from "./study-activity";

const NOW = new Date("2026-10-06T10:00:00.000Z");
function review(
  id: string,
  at: string,
  phase: StudyActivityReview["phaseBefore"] = "review",
  durationMs: number | null = 20_000,
): StudyActivityReview {
  return { id, practiceItemId: "item", reviewedAt: new Date(at), phaseBefore: phase, durationMs };
}

describe("study activity", () => {
  it.each([
    ["2026-03-29T12:00:00Z", "2026-03-22T23:00:00.000Z", 167],
    ["2026-10-25T12:00:00Z", "2026-10-18T22:00:00.000Z", 169],
  ])("walks seven contiguous calendar days across DST at %s", (now, start, hours) => {
    const days = recentStudyDays(new Date(now), "Europe/Madrid");
    expect(days).toHaveLength(7);
    expect(days[0]!.start.toISOString()).toBe(start);
    expect((days[6]!.end.getTime() - days[0]!.start.getTime()) / 3_600_000).toBe(hours);
    for (let index = 1; index < days.length; index++)
      expect(days[index]!.start).toEqual(days[index - 1]!.end);
  });

  it("counts attempts, unique new introductions and only recorded duration", () => {
    const days = recentStudyDays(NOW, "Europe/Madrid");
    const rows = [
      review("one", "2026-10-05T22:00:00Z", "new"),
      review("two", "2026-10-06T09:00:00Z", "new", null),
      review("three", "2026-10-05T21:59:59Z", "learning", 10_000),
    ];
    const result = summarizeStudyActivity(days, rows, NOW);
    expect(result.days[6]).toMatchObject({
      reviews: 2,
      newIntroduced: 1,
      durationMs: 20_000,
      measuredReviews: 1,
    });
    expect(result.days[5]).toMatchObject({ reviews: 1, newIntroduced: 0 });
    expect(result.totals).toEqual({
      reviews: 3,
      newIntroduced: 1,
      durationMs: 30_000,
      measuredReviews: 2,
    });
    expect(result.days.filter((day) => day.reviews === 0)).toHaveLength(5);
  });

  it("excludes future/out-of-window attempts and deduplicates log IDs", () => {
    const days = recentStudyDays(NOW, "Europe/Madrid");
    const row = review("one", NOW.toISOString());
    const result = summarizeStudyActivity(
      days,
      [
        row,
        row,
        review("old", "2026-09-29T21:59:59Z"),
        review("future", "2026-10-06T10:00:00.001Z"),
      ],
      NOW,
    );
    expect(result.totals.reviews).toBe(1);
  });

  it("does not invent missing time and retains an explicitly measured zero", () => {
    const result = summarizeStudyActivity(
      recentStudyDays(NOW, "Europe/Madrid"),
      [
        review("one", NOW.toISOString(), null, 0),
        review("two", NOW.toISOString(), null, Infinity),
        review("three", NOW.toISOString(), null, -1),
      ],
      NOW,
    );
    expect(result.totals).toMatchObject({ reviews: 3, durationMs: 0, measuredReviews: 1 });
  });
});
