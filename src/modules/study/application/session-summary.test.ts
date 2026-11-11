import { describe, expect, it, vi } from "vitest";
import { getStudySessionSummary, type SessionHistoryRepository } from "./session-summary";
import type { StudySession, StudySessionRepository } from "./study-session";
import type { DailyQueueRepository } from "./daily-queue";
import { StudyError } from "./study-error";

const now = new Date("2026-10-16T10:00:00Z");
const id = "50000000-0000-4000-8000-00000000000a";
const input = { ownerId: "owner", sessionId: id.toUpperCase(), now, timeZone: "Europe/Madrid" };
function fixture(status: StudySession["status"] = "paused") {
  const session: StudySession = {
    id,
    ownerId: "owner",
    courseId: "saved-course",
    scope: { deckIds: ["saved-deck"] },
    startedAt: now,
    endedAt: null,
    status,
  };
  const sessions: StudySessionRepository = {
    get: vi.fn().mockResolvedValue(session),
    create: vi.fn(),
    transition: vi.fn(),
    listOpen: vi.fn(),
  };
  const history: SessionHistoryRepository = {
    listReviews: vi.fn().mockResolvedValue([
      { id: "one", practiceItemId: "item", phaseBefore: "new", rating: "again", durationMs: null },
      {
        id: "two",
        practiceItemId: "item",
        phaseBefore: "learning",
        rating: "good",
        durationMs: null,
      },
    ]),
  };
  const queue: DailyQueueRepository = {
    getCourseLimits: vi.fn().mockResolvedValue({ dailyNewLimit: 1, maximumReviewsPerDay: 0 }),
    listEligibleItems: vi.fn().mockResolvedValue([
      ...["a", "b"].map((practiceItemId) => ({
        practiceItemId,
        phase: "review",
        dueAt: now,
        learningStateId: practiceItemId,
        revision: 1,
      })),
      ...["c", "d"].map((practiceItemId) => ({
        practiceItemId,
        phase: null,
        dueAt: null,
        learningStateId: null,
        revision: null,
      })),
      {
        practiceItemId: "future",
        phase: "learning",
        dueAt: new Date(now.getTime() + 60_000),
        learningStateId: "state",
        revision: 2,
      },
    ]),
    countTodayActivity: vi.fn().mockResolvedValue({ newIntroduced: 0, reviewsDone: 0 }),
    getTimeZone: vi.fn(),
  };
  return { sessions, history, queue };
}
describe("getStudySessionSummary", () => {
  it.each(["paused", "completed", "abandoned"] as const)(
    "summarizes %s history and recomputes current pending items using its saved scope",
    async (status) => {
      const f = fixture(status);
      const result = await getStudySessionSummary(f.sessions, f.history, f.queue, input);
      expect(result).toEqual({
        ok: true,
        summary: {
          reviewCount: 2,
          newItemCount: 1,
          unclassifiedCount: 0,
          ratings: { again: 1, hard: 0, good: 1, easy: 0 },
          recordedDurationMs: null,
          timedReviewCount: 0,
          remaining: {
            availableCount: 1,
            hiddenDueReviews: 2,
            hiddenNew: 1,
            hasFutureReviews: true,
          },
        },
      });
      expect(f.history.listReviews).toHaveBeenCalledExactlyOnceWith({
        ownerId: "owner",
        sessionId: id,
        now,
      });
      expect(f.queue.listEligibleItems).toHaveBeenCalledWith({
        ownerId: "owner",
        courseId: "saved-course",
        deckIds: ["saved-deck"],
      });
      expect(f.sessions.create).not.toHaveBeenCalled();
      expect(f.sessions.transition).not.toHaveBeenCalled();
    },
  );
  it("does not read history or pending items for an active session", async () => {
    const f = fixture("active");
    expect(await getStudySessionSummary(f.sessions, f.history, f.queue, input)).toEqual({
      ok: false,
      reason: "active-session",
    });
    expect(f.history.listReviews).not.toHaveBeenCalled();
    expect(f.queue.getCourseLimits).not.toHaveBeenCalled();
  });
  it("rejects malformed, unknown and foreign sessions before reading history", async () => {
    const f = fixture();
    expect(
      await getStudySessionSummary(f.sessions, f.history, f.queue, { ...input, sessionId: "bad" }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(f.sessions.get).not.toHaveBeenCalled();
    vi.mocked(f.sessions.get).mockResolvedValue(null);
    expect(await getStudySessionSummary(f.sessions, f.history, f.queue, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    vi.mocked(f.sessions.get).mockResolvedValue({
      id,
      ownerId: "other",
      courseId: "foreign",
      scope: { deckIds: null },
      status: "completed",
      startedAt: now,
      endedAt: now,
    });
    expect(await getStudySessionSummary(f.sessions, f.history, f.queue, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(f.history.listReviews).not.toHaveBeenCalled();
    expect(f.queue.getCourseLimits).not.toHaveBeenCalled();
  });
  it("requires a verified identity", async () => {
    const f = fixture();
    await expect(
      getStudySessionSummary(f.sessions, f.history, f.queue, { ...input, ownerId: " " }),
    ).rejects.toThrow(/verified owner/);
  });
  it.each(["missing-course", "invalid-timezone"] as const)(
    "keeps history but never invents zero pending items when %s",
    async (reason) => {
      const f = fixture();
      if (reason === "missing-course") vi.mocked(f.queue.getCourseLimits).mockResolvedValue(null);
      expect(
        await getStudySessionSummary(f.sessions, f.history, f.queue, {
          ...input,
          timeZone: reason === "invalid-timezone" ? "Mars/Olympus" : input.timeZone,
        }),
      ).toMatchObject({
        ok: true,
        summary: { reviewCount: 2, remaining: null, recordedDurationMs: null },
      });
    },
  );
  it("recomputes pending items after a scope edit without altering confirmed history", async () => {
    const f = fixture();
    const first = await getStudySessionSummary(f.sessions, f.history, f.queue, input);
    vi.mocked(f.queue.listEligibleItems).mockResolvedValue([]);
    const next = await getStudySessionSummary(f.sessions, f.history, f.queue, input);
    expect(first.ok && first.summary.remaining?.availableCount).toBe(1);
    expect(next).toMatchObject({
      ok: true,
      summary: {
        reviewCount: 2,
        newItemCount: 1,
        remaining: {
          availableCount: 0,
          hiddenNew: 0,
          hiddenDueReviews: 0,
          hasFutureReviews: false,
        },
      },
    });
  });
  it("surfaces failed history reads instead of fabricating an empty summary", async () => {
    const f = fixture();
    vi.mocked(f.history.listReviews).mockRejectedValue(new StudyError("unavailable", "synthetic"));
    await expect(
      getStudySessionSummary(f.sessions, f.history, f.queue, input),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});
