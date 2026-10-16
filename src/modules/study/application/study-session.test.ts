import { describe, expect, it, vi } from "vitest";

import type { DailyQueueRepository } from "./daily-queue";
import type { TodayDashboardRepository } from "./today-dashboard";
import { StudyError } from "./study-error";
import {
  createStudySession,
  getStudySession,
  getStudySetup,
  changeStudySession,
  listOpenStudySessions,
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
    listOpen: vi.fn().mockResolvedValue([]),
    transition: vi.fn(async ({ ownerId, sessionId, expectedStatus, status, endedAt }) => {
      const row = records.get(sessionId);
      if (!row || row.ownerId !== ownerId || row.status !== expectedStatus) return null;
      const changed = { ...row, status, endedAt };
      records.set(sessionId, changed);
      return changed;
    }),
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

describe("changeStudySession", () => {
  const command = { ...input, action: "pause", expectedStatus: "active" };
  it("pauses, retries without writing, resumes the same scope with current data, and abandons permanently", async () => {
    const f = repositories();
    f.records.set(SESSION, stored({ deckIds: [DECK] }));
    const paused = await changeStudySession(f.sessions, f.queue, command);
    expect(paused.ok && paused.session).toMatchObject({
      status: "paused",
      endedAt: null,
      scope: { deckIds: [DECK] },
    });
    expect(await changeStudySession(f.sessions, f.queue, command)).toEqual(paused);
    expect(f.sessions.transition).toHaveBeenCalledTimes(1);
    expect(await getStudySession(f.sessions, f.queue, input)).toMatchObject({ queue: null });
    vi.mocked(f.queue.listEligibleItems).mockResolvedValue([]);
    expect(
      await changeStudySession(f.sessions, f.queue, {
        ...command,
        action: "resume",
        expectedStatus: "paused",
      }),
    ).toMatchObject({
      ok: true,
      session: { status: "active", scope: { deckIds: [DECK] }, endedAt: null },
    });
    expect(await getStudySession(f.sessions, f.queue, input)).toMatchObject({
      queue: { entries: [] },
    });
    const end = new Date(NOW.getTime() + 60_000);
    const abandoned = await changeStudySession(f.sessions, f.queue, {
      ...command,
      action: "abandon",
      now: end,
    });
    expect(abandoned).toMatchObject({ ok: true, session: { status: "abandoned", endedAt: end } });
    expect(
      await changeStudySession(f.sessions, f.queue, {
        ...command,
        action: "abandon",
        now: new Date(end.getTime() + 60_000),
      }),
    ).toEqual(abandoned);
    expect(
      await changeStudySession(f.sessions, f.queue, {
        ...command,
        action: "resume",
        expectedStatus: "abandoned",
      }),
    ).toEqual({ ok: false, reason: "invalid-transition" });
    expect(f.sessions.create).not.toHaveBeenCalled();
  });
  it("completes only after rechecking an empty current queue, preserving a terminal timestamp on retry", async () => {
    const f = repositories();
    f.records.set(SESSION, stored());
    expect(
      await changeStudySession(f.sessions, f.queue, { ...command, action: "complete" }),
    ).toEqual({ ok: false, reason: "items-available" });
    expect(f.sessions.transition).not.toHaveBeenCalled();
    vi.mocked(f.queue.listEligibleItems).mockResolvedValue([]);
    const result = await changeStudySession(f.sessions, f.queue, {
      ...command,
      action: "complete",
    });
    expect(result).toMatchObject({ ok: true, session: { status: "completed", endedAt: NOW } });
    expect(
      await changeStudySession(f.sessions, f.queue, {
        ...command,
        action: "complete",
        now: new Date(NOW.getTime() + 1000),
      }),
    ).toEqual(result);
    expect(
      await changeStudySession(f.sessions, f.queue, {
        ...command,
        action: "resume",
        expectedStatus: "completed",
      }),
    ).toEqual({ ok: false, reason: "invalid-transition" });
  });
  it("detects a stale observation and a concurrent compare-and-set loser", async () => {
    const f = repositories();
    f.records.set(SESSION, { ...stored(), status: "paused" });
    expect(
      await changeStudySession(f.sessions, f.queue, { ...command, action: "abandon" }),
    ).toEqual({ ok: false, reason: "session-changed" });
    f.records.set(SESSION, stored());
    vi.mocked(f.sessions.transition).mockResolvedValue(null);
    expect(await changeStudySession(f.sessions, f.queue, command)).toEqual({
      ok: false,
      reason: "session-changed",
    });
  });
  it.each([{ sessionId: "bad" }, { action: "delete" }, { expectedStatus: "fake" }])(
    "rejects malformed intent %j",
    async (change) => {
      const f = repositories();
      expect(await changeStudySession(f.sessions, f.queue, { ...command, ...change })).toEqual({
        ok: false,
        reason: "invalid-input",
      });
      expect(f.sessions.get).not.toHaveBeenCalled();
      expect(f.sessions.transition).not.toHaveBeenCalled();
    },
  );
  it("rejects unknown and foreign sessions without writes", async () => {
    const f = repositories();
    expect(await changeStudySession(f.sessions, f.queue, command)).toEqual({
      ok: false,
      reason: "not-found",
    });
    f.records.set(SESSION, { ...stored(), ownerId: "another" });
    expect(await changeStudySession(f.sessions, f.queue, command)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(f.sessions.transition).not.toHaveBeenCalled();
  });
  it("requires an identity for transitions and open-session discovery", async () => {
    const f = repositories();
    await expect(
      changeStudySession(f.sessions, f.queue, { ...command, ownerId: " " }),
    ).rejects.toThrow(/sin identificador/);
    await expect(listOpenStudySessions(f.sessions, { ...input, ownerId: " " })).rejects.toThrow(
      /sin identificador/,
    );
    await listOpenStudySessions(f.sessions, input);
    expect(f.sessions.listOpen).toHaveBeenCalledWith(input);
  });
  it("surfaces storage failures and rejects inaccessible courses when resuming", async () => {
    const f = repositories();
    f.records.set(SESSION, { ...stored(), status: "paused" });
    vi.mocked(f.queue.getCourseLimits).mockResolvedValue(null);
    expect(
      await changeStudySession(f.sessions, f.queue, {
        ...command,
        expectedStatus: "paused",
        action: "resume",
      }),
    ).toEqual({ ok: false, reason: "not-found" });
    vi.mocked(f.sessions.transition).mockRejectedValue(
      new StudyError("unavailable", "synthetic failure"),
    );
    await expect(
      changeStudySession(f.sessions, f.queue, {
        ...command,
        action: "abandon",
        expectedStatus: "paused",
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});
