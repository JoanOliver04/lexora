import { describe, expect, it, vi } from "vitest";

import type { DailyQueueRepository } from "./daily-queue";
import type { TodayDashboardRepository } from "./today-dashboard";
import { StudyError } from "./study-error";
import {
  createStudySession,
  getStudySession,
  getStudySetup,
  type StudySession,
  type StudySessionRepository,
} from "./study-session";

const NOW = new Date("2026-10-06T10:00:00Z");
const SESSION = "50000000-0000-4000-8000-000000000001";
const DECK = "d0000000-0000-4000-8000-000000000001";
const OTHER = "d0000000-0000-4000-8000-000000000002";
const input = {
  ownerId: "owner",
  courseId: "course",
  now: NOW,
  timeZone: "Europe/Madrid",
  sessionId: SESSION,
  mode: "all",
  deckIds: [],
};
function stored(scope: StudySession["scope"] = { deckIds: null }): StudySession {
  return {
    id: SESSION,
    ownerId: "owner",
    courseId: "course",
    scope,
    status: "active",
    startedAt: NOW,
    endedAt: null,
  };
}
function repositories() {
  const records = new Map<string, StudySession>();
  const sessions: StudySessionRepository = {
    get: vi.fn().mockImplementation(async ({ ownerId, sessionId }) => {
      const row = records.get(sessionId);
      return row?.ownerId === ownerId ? row : null;
    }),
    create: vi
      .fn()
      .mockImplementation(async ({ ownerId, sessionId, courseId, scope, startedAt }) => {
        if (records.has(sessionId)) throw new StudyError("duplicate", "duplicate session");
        const session = {
          id: sessionId,
          ownerId,
          courseId,
          scope,
          startedAt,
          status: "active" as const,
          endedAt: null,
        };
        records.set(sessionId, session);
        return session;
      }),
  };
  const queue: DailyQueueRepository = {
    getCourseLimits: vi.fn().mockResolvedValue({ dailyNewLimit: 1, maximumReviewsPerDay: 1 }),
    listEligibleItems: vi.fn().mockResolvedValue([
      {
        practiceItemId: "review",
        phase: "review",
        dueAt: NOW,
        learningStateId: "state",
        revision: 1,
      },
      { practiceItemId: "new-1", phase: null, dueAt: null, learningStateId: null, revision: null },
      { practiceItemId: "new-2", phase: null, dueAt: null, learningStateId: null, revision: null },
    ]),
    countTodayActivity: vi.fn().mockResolvedValue({ newIntroduced: 0, reviewsDone: 0 }),
    getTimeZone: vi.fn().mockResolvedValue("Europe/Madrid"),
  };
  const decks: Pick<TodayDashboardRepository, "listActiveDecks"> = {
    listActiveDecks: vi.fn().mockResolvedValue([
      { id: DECK, title: "One" },
      { id: OTHER, title: "Two" },
    ]),
  };
  return { sessions, queue, decks, records };
}

describe("createStudySession", () => {
  it("stores an active scope and the authoritative time, without storing queue entries", async () => {
    const { sessions, queue, decks } = repositories();
    expect(await createStudySession(sessions, queue, decks, input)).toEqual({
      ok: true,
      session: stored(),
      replayed: false,
    });
    expect(sessions.create).toHaveBeenCalledExactlyOnceWith({
      ownerId: "owner",
      sessionId: SESSION,
      courseId: "course",
      scope: { deckIds: null },
      startedAt: NOW,
    });
    expect(queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "course",
      deckIds: null,
    });
  });

  it("uses normalized selected decks, not a course or owner supplied by the browser", async () => {
    const { sessions, queue, decks } = repositories();
    const result = await createStudySession(sessions, queue, decks, {
      ...input,
      mode: "selected",
      deckIds: [DECK.toUpperCase(), DECK],
    });
    expect(result.ok && result.session.scope).toEqual({ deckIds: [DECK] });
    expect(queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "course",
      deckIds: [DECK],
    });
  });

  it.each([
    { deckIds: [] },
    { deckIds: ["invalid"] },
    { deckIds: ["d0000000-0000-4000-8000-000000000003"] },
    { deckIds: [123] },
  ])("rejects invalid, empty, archived or foreign selected decks %j", async ({ deckIds }) => {
    const { sessions, queue, decks } = repositories();
    expect(
      await createStudySession(sessions, queue, decks, { ...input, mode: "selected", deckIds }),
    ).toEqual({ ok: false, reason: "invalid-scope" });
    expect(sessions.create).not.toHaveBeenCalled();
    expect(queue.listEligibleItems).not.toHaveBeenCalled();
  });

  it("rejects an unknown selection mode or invalid request ID", async () => {
    const { sessions, queue, decks } = repositories();
    expect(await createStudySession(sessions, queue, decks, { ...input, mode: "other" })).toEqual({
      ok: false,
      reason: "invalid-scope",
    });
    expect(
      await createStudySession(sessions, queue, decks, { ...input, sessionId: "bad" }),
    ).toEqual({ ok: false, reason: "invalid-session-id" });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("does not create a session when today's limits leave no available items", async () => {
    const { sessions, queue, decks } = repositories();
    vi.mocked(queue.countTodayActivity).mockResolvedValue({ newIntroduced: 1, reviewsDone: 1 });
    expect(await createStudySession(sessions, queue, decks, input)).toEqual({
      ok: false,
      reason: "no-items",
    });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("checks current availability rather than relying on the setup page", async () => {
    const { sessions, queue, decks } = repositories();
    vi.mocked(queue.listEligibleItems).mockResolvedValue([
      {
        practiceItemId: "future",
        phase: "learning",
        dueAt: new Date("2026-10-07T10:00:00Z"),
        learningStateId: "state",
        revision: 1,
      },
    ]);
    expect(await createStudySession(sessions, queue, decks, input)).toEqual({
      ok: false,
      reason: "no-items",
    });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("does not create a session for an inaccessible course or invalid timezone", async () => {
    const { sessions, queue, decks } = repositories();
    vi.mocked(queue.getCourseLimits).mockResolvedValue(null);
    expect(await createStudySession(sessions, queue, decks, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(
      await createStudySession(sessions, queue, decks, { ...input, timeZone: "Mars/Olympus" }),
    ).toEqual({ ok: false, reason: "invalid-timezone" });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("replays a successful creation before rereading quota or writing again", async () => {
    const { sessions, queue, decks, records } = repositories();
    records.set(SESSION, stored());
    expect(await createStudySession(sessions, queue, decks, input)).toEqual({
      ok: true,
      session: stored(),
      replayed: true,
    });
    expect(queue.getCourseLimits).not.toHaveBeenCalled();
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("allows the same selected set in a different order but rejects a changed scope", async () => {
    const { sessions, queue, decks, records } = repositories();
    records.set(SESSION, stored({ deckIds: [DECK, OTHER] }));
    const result = await createStudySession(sessions, queue, decks, {
      ...input,
      mode: "selected",
      deckIds: [OTHER, DECK],
    });
    expect(result.ok && result.replayed).toBe(true);
    expect(await createStudySession(sessions, queue, decks, input)).toEqual({
      ok: false,
      reason: "session-conflict",
    });
  });

  it("recovers the winning row after a concurrent primary-key collision", async () => {
    const { sessions, queue, decks } = repositories();
    vi.mocked(sessions.get).mockResolvedValueOnce(null).mockResolvedValueOnce(stored());
    vi.mocked(sessions.create).mockRejectedValue(new StudyError("duplicate", "race"));
    expect(await createStudySession(sessions, queue, decks, input)).toEqual({
      ok: true,
      session: stored(),
      replayed: true,
    });
  });

  it("does not expose or overwrite another owner's known session ID", async () => {
    const { sessions, queue, decks, records } = repositories();
    records.set(SESSION, { ...stored(), ownerId: "other-owner" });
    expect(await createStudySession(sessions, queue, decks, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(records.get(SESSION)?.ownerId).toBe("other-owner");
  });

  it("does not hide a failed write", async () => {
    const { sessions, queue, decks } = repositories();
    vi.mocked(sessions.create).mockRejectedValue(new StudyError("unavailable", "write failed"));
    await expect(createStudySession(sessions, queue, decks, input)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });
});

describe("session reads and setup", () => {
  it("keeps the setup total for the course and preserves a selected starting scope", async () => {
    const { queue, decks } = repositories();
    const result = await getStudySetup(queue, decks, { ...input, deckQuery: DECK });
    expect(result.ok && result.setup.scope).toEqual({ deckIds: [DECK] });
    expect(
      result.ok && result.setup.courseQueue.entries.map((entry) => entry.practiceItemId),
    ).toEqual(["review", "new-1"]);
    expect(result.ok && result.setup.courseQueue.hiddenNew).toBe(1);
    expect(queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "course",
      deckIds: null,
    });
  });

  it("rejects an invalid setup scope", async () => {
    const { queue, decks } = repositories();
    expect(await getStudySetup(queue, decks, { ...input, deckQuery: "invalid" })).toEqual({
      ok: false,
      reason: "invalid-scope",
    });
  });

  it("rebuilds the active session's queue from current data and the saved scope", async () => {
    const { sessions, queue, records } = repositories();
    records.set(SESSION, stored({ deckIds: [DECK] }));
    const result = await getStudySession(sessions, queue, input);
    expect(result.ok && result.queue?.entries).toHaveLength(2);
    expect(queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "course",
      deckIds: [DECK],
    });
    vi.mocked(queue.listEligibleItems).mockResolvedValue([]);
    const refreshed = await getStudySession(sessions, queue, input);
    expect(refreshed.ok && refreshed.queue?.entries).toEqual([]);
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("never revives an inactive session while loading it", async () => {
    const { sessions, queue, records } = repositories();
    records.set(SESSION, { ...stored(), status: "completed", endedAt: NOW });
    expect(await getStudySession(sessions, queue, input)).toEqual({
      ok: true,
      session: records.get(SESSION),
      queue: null,
    });
    expect(queue.listEligibleItems).not.toHaveBeenCalled();
  });

  it("returns not-found for unknown, foreign or malformed session IDs", async () => {
    const { sessions, queue, records } = repositories();
    records.set(SESSION, { ...stored(), ownerId: "other-owner" });
    expect(await getStudySession(sessions, queue, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await getStudySession(sessions, queue, { ...input, sessionId: "bad" })).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(queue.listEligibleItems).not.toHaveBeenCalled();
  });

  it("rejects an empty identity in every entry point", async () => {
    const { sessions, queue, decks } = repositories();
    await expect(
      createStudySession(sessions, queue, decks, { ...input, ownerId: " " }),
    ).rejects.toThrow(/sin identificador/);
    await expect(getStudySetup(queue, decks, { ...input, ownerId: " " })).rejects.toThrow(
      /sin identificador/,
    );
    await expect(getStudySession(sessions, queue, { ...input, ownerId: " " })).rejects.toThrow(
      /sin identificador/,
    );
  });
});
