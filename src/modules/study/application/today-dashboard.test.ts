import { describe, expect, it, vi } from "vitest";

import type { DailyQueueRepository } from "./daily-queue";
import type { TodayOverviewRepository } from "./today-overview";
import { getTodayDashboard, type TodayDashboardRepository } from "./today-dashboard";

const NOW = new Date("2026-10-06T10:00:00Z");
const DECK = "d0000000-0000-4000-8000-000000000001";
const FOREIGN = "d0000000-0000-4000-8000-000000000002";
const input = { ownerId: "owner", courseId: "course", now: NOW, timeZone: "Europe/Madrid" };
function repositories() {
  const queue: DailyQueueRepository = {
    getCourseLimits: vi.fn().mockResolvedValue({ dailyNewLimit: 5, maximumReviewsPerDay: null }),
    listEligibleItems: vi.fn().mockResolvedValue([]),
    countTodayActivity: vi.fn().mockResolvedValue({ newIntroduced: 0, reviewsDone: 0 }),
    getTimeZone: vi.fn().mockResolvedValue(input.timeZone),
  };
  const overview: TodayOverviewRepository = {
    getDifficultySignals: vi.fn().mockResolvedValue([]),
    listRecentDurations: vi.fn().mockResolvedValue([]),
  };
  const dashboard: TodayDashboardRepository = {
    listActiveDecks: vi.fn().mockResolvedValue([{ id: DECK, title: "Vocab" }]),
    getLastStudyScope: vi.fn().mockResolvedValue({ deckIds: [DECK] }),
    listReviewActivity: vi.fn().mockResolvedValue([
      {
        id: "log",
        practiceItemId: "item",
        reviewedAt: NOW,
        phaseBefore: "new",
        durationMs: 30_000,
      },
    ]),
  };
  return { queue, overview, dashboard };
}

describe("Today dashboard", () => {
  it("restores a valid filter while keeping activity scoped to the whole course", async () => {
    const { queue, overview, dashboard } = repositories();
    const result = await getTodayDashboard(queue, overview, dashboard, {
      ...input,
      deckQuery: [DECK, DECK],
    });
    expect(result.ok && result.dashboard).toMatchObject({
      scope: { deckIds: [DECK] },
      scopeDeckNames: ["Vocab"],
      lastScopeAvailable: true,
      status: "empty",
      today: { reviews: 1, newIntroduced: 1 },
      week: { reviews: 1 },
    });
    expect(queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "course",
      deckIds: [DECK],
    });
    expect(dashboard.listReviewActivity).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "course",
      since: new Date("2026-09-29T22:00:00Z"),
      now: NOW,
    });
  });

  it("makes an unavailable last scope explicit without changing today's default scope", async () => {
    const { queue, overview, dashboard } = repositories();
    vi.mocked(dashboard.getLastStudyScope).mockResolvedValue({ deckIds: [FOREIGN] });
    const result = await getTodayDashboard(queue, overview, dashboard, input);
    expect(result.ok && result.dashboard).toMatchObject({
      lastScopeAvailable: false,
      scope: { deckIds: null },
    });
    expect(queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "course",
      deckIds: null,
    });
  });

  it("rejects another course's or owner's deck instead of silently showing an empty queue", async () => {
    const { queue, overview, dashboard } = repositories();
    expect(
      await getTodayDashboard(queue, overview, dashboard, { ...input, deckQuery: FOREIGN }),
    ).toEqual({ ok: false, reason: "invalid-filter" });
    expect(queue.listEligibleItems).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", Array(101).fill(DECK)])(
    "rejects an invalid filter before reading the repository",
    async (deckQuery) => {
      const { queue, overview, dashboard } = repositories();
      expect(await getTodayDashboard(queue, overview, dashboard, { ...input, deckQuery })).toEqual({
        ok: false,
        reason: "invalid-filter",
      });
      expect(dashboard.listActiveDecks).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["ready", "new", NOW, 5],
    ["limited", "new", NOW, 0],
    ["waiting", "learning", new Date("2026-10-07T10:00:00Z"), 5],
  ] as const)("distinguishes %s from an empty library", async (status, phase, dueAt, limit) => {
    const { queue, overview, dashboard } = repositories();
    vi.mocked(queue.getCourseLimits).mockResolvedValue({
      dailyNewLimit: limit,
      maximumReviewsPerDay: null,
    });
    vi.mocked(queue.listEligibleItems).mockResolvedValue([
      { practiceItemId: "item", phase, dueAt, learningStateId: "state", revision: 1 },
    ]);
    const result = await getTodayDashboard(queue, overview, dashboard, input);
    expect(result.ok && result.dashboard.status).toBe(status);
  });

  it("preserves an inaccessible course result", async () => {
    const { queue, overview, dashboard } = repositories();
    vi.mocked(queue.getCourseLimits).mockResolvedValue(null);
    expect(await getTodayDashboard(queue, overview, dashboard, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
  });

  it("validates identity and timezone before repository reads", async () => {
    const { queue, overview, dashboard } = repositories();
    await expect(
      getTodayDashboard(queue, overview, dashboard, { ...input, ownerId: " " }),
    ).rejects.toThrow(/sin identificador/);
    expect(
      await getTodayDashboard(queue, overview, dashboard, { ...input, timeZone: "Mars/Olympus" }),
    ).toEqual({ ok: false, reason: "invalid-timezone" });
    expect(dashboard.listReviewActivity).not.toHaveBeenCalled();
  });

  it("propagates failed activity reads rather than showing zero activity", async () => {
    const { queue, overview, dashboard } = repositories();
    vi.mocked(dashboard.listReviewActivity).mockRejectedValue(new Error("unavailable"));
    await expect(getTodayDashboard(queue, overview, dashboard, input)).rejects.toThrow(
      "unavailable",
    );
  });
});
