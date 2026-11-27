import { describe, expect, it, vi } from "vitest";

import type { QueueCandidate } from "@/modules/study/domain/queue";
import { queueFixture } from "../../../../tests/unit/study/queue-fixture";
import { getTodayOverview, type TodayOverviewRepository } from "./today-overview";

const NOW = new Date("2026-10-06T10:00:00.000Z");
const input = { ownerId: "owner-a", courseId: "course-a", now: NOW, timeZone: "Europe/Madrid" };

function candidate(
  id: string,
  phase: QueueCandidate["phase"],
  dueAt: Date | null = NOW,
): QueueCandidate {
  return {
    practiceItemId: id,
    phase,
    dueAt,
    learningStateId: phase ? `state-${id}` : null,
    revision: phase ? 1 : null,
  };
}

function repositories() {
  const queue = queueFixture({
    getCourseLimits: vi.fn().mockResolvedValue({ dailyNewLimit: 2, maximumReviewsPerDay: 2 }),
    listEligibleItems: vi.fn().mockResolvedValue([]),
    countTodayActivity: vi.fn().mockResolvedValue({ newIntroduced: 0, reviewsDone: 0 }),
  });
  const history: TodayOverviewRepository = {
    listRecentDurations: vi.fn().mockResolvedValue([]),
  };
  return { queue, history };
}

describe("getTodayOverview", () => {
  it("uses the same eligible queue and limits, including hidden work", async () => {
    const { queue, history } = repositories();
    const future = new Date("2026-10-06T10:10:00.000Z");
    vi.mocked(queue.countTodayActivity).mockResolvedValue({ newIntroduced: 1, reviewsDone: 1 });
    vi.mocked(queue.countEligibleItems).mockResolvedValue({
      learningDue: 2,
      reviewsDue: 3,
      newItems: 3,
      difficultItems: 2,
      nextDueAt: future,
      nextLearningDueAt: future,
    });
    const result = await getTodayOverview(queue, history, { ...input, deckIds: ["deck-a"] });
    expect(result).toEqual({
      ok: true,
      overview: {
        dueReviews: 3,
        availableReviews: 1,
        learningDue: 2,
        newAvailable: 1,
        difficultItems: 2,
        availableCount: 4,
        hiddenDueReviews: 2,
        hiddenNew: 2,
        nextDueAt: future,
        estimate: { source: "fallback", sampleSize: 0, perReviewMs: 30_000, totalMs: 120_000 },
      },
    });
    expect(queue.countEligibleItems).toHaveBeenCalledExactlyOnceWith(
      { ownerId: input.ownerId, courseId: input.courseId, deckIds: ["deck-a"], now: NOW },
      true,
    );
    expect(queue.listAvailableEntries).not.toHaveBeenCalled();
  });

  it("does not claim all work is finished when limits exhaust the queue", async () => {
    const { queue, history } = repositories();
    vi.mocked(queue.listEligibleItems).mockResolvedValue([
      candidate("r", "review"),
      candidate("n", null),
    ]);
    vi.mocked(queue.countTodayActivity).mockResolvedValue({ newIntroduced: 2, reviewsDone: 2 });
    const result = await getTodayOverview(queue, history, input);
    expect(result.ok && result.overview).toMatchObject({
      dueReviews: 1,
      availableReviews: 0,
      newAvailable: 0,
      availableCount: 0,
      hiddenDueReviews: 1,
      hiddenNew: 1,
      estimate: { totalMs: 0 },
    });
  });

  it("uses the scoped difficulty count independently of available work", async () => {
    const { queue, history } = repositories();
    vi.mocked(queue.countEligibleItems).mockResolvedValue({
      learningDue: 0,
      reviewsDue: 0,
      newItems: 2,
      difficultItems: 1,
      nextDueAt: null,
      nextLearningDueAt: null,
    });
    const result = await getTodayOverview(queue, history, input);
    expect(result.ok && result.overview).toMatchObject({ newAvailable: 2, difficultItems: 1 });
  });

  it("uses the user's recent median and a fixed server-time window", async () => {
    const { queue, history } = repositories();
    vi.mocked(queue.listEligibleItems).mockResolvedValue([candidate("n", null)]);
    vi.mocked(history.listRecentDurations).mockResolvedValue([
      10_000, 20_000, 30_000, 40_000, 3_600_000,
    ]);
    const result = await getTodayOverview(queue, history, input);
    expect(result.ok && result.overview.estimate).toEqual({
      source: "history",
      sampleSize: 5,
      perReviewMs: 30_000,
      totalMs: 30_000,
    });
    expect(history.listRecentDurations).toHaveBeenCalledExactlyOnceWith({
      ownerId: "owner-a",
      since: new Date("2026-09-06T10:00:00.000Z"),
      now: NOW,
      limit: 100,
    });
  });

  it("preserves an empty deck selection and skips the difficulty lookup", async () => {
    const { queue, history } = repositories();
    const result = await getTodayOverview(queue, history, { ...input, deckIds: [] });
    expect(result.ok && result.overview).toMatchObject({
      availableCount: 0,
      dueReviews: 0,
      difficultItems: 0,
      estimate: { totalMs: 0 },
    });
    expect(queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner-a",
      courseId: "course-a",
      deckIds: [],
    });
    expect(queue.listAvailableEntries).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-10-05T22:00:00.000Z", "2026-10-06T22:00:00.000Z", "2026-10-06T00:00:00.000Z"],
    ["2026-03-28T23:00:00.000Z", "2026-03-29T22:00:00.000Z", "2026-03-29T10:00:00.000Z"],
    ["2026-10-24T22:00:00.000Z", "2026-10-25T23:00:00.000Z", "2026-10-25T10:00:00.000Z"],
  ])("shares the local-day quota window %s to %s", async (start, end, now) => {
    const { queue, history } = repositories();
    await getTodayOverview(queue, history, { ...input, now: new Date(now) });
    expect(queue.countTodayActivity).toHaveBeenCalledWith({
      ownerId: "owner-a",
      courseId: "course-a",
      dayStart: new Date(start),
      dayEnd: new Date(end),
    });
  });

  it("rejects an empty identity", async () => {
    const { queue, history } = repositories();
    await expect(getTodayOverview(queue, history, { ...input, ownerId: " " })).rejects.toThrow(
      /sin identificador/,
    );
    expect(history.listRecentDurations).not.toHaveBeenCalled();
  });

  it("does not query history for an inaccessible course", async () => {
    const { queue, history } = repositories();
    vi.mocked(queue.getCourseLimits).mockResolvedValue(null);
    expect(await getTodayOverview(queue, history, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(queue.listAvailableEntries).not.toHaveBeenCalled();
    expect(history.listRecentDurations).not.toHaveBeenCalled();
  });

  it("does not query history for an invalid timezone", async () => {
    const { queue, history } = repositories();
    expect(await getTodayOverview(queue, history, { ...input, timeZone: "Mars/Olympus" })).toEqual({
      ok: false,
      reason: "invalid-timezone",
    });
    expect(history.listRecentDurations).not.toHaveBeenCalled();
  });

  it("propagates a history failure instead of returning misleading zero counts", async () => {
    const { queue, history } = repositories();
    vi.mocked(history.listRecentDurations).mockRejectedValue(new Error("unavailable"));
    await expect(getTodayOverview(queue, history, input)).rejects.toThrow("unavailable");
  });
});
