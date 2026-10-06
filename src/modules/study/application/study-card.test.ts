import { describe, expect, it, vi } from "vitest";

import type { DailyQueueRepository } from "./daily-queue";
import type { StudySession, StudySessionRepository } from "./study-session";
import { StudyError } from "./study-error";
import {
  getStudySessionCard,
  revealStudySessionCard,
  type StudyCardRepository,
} from "./study-card";

const now = new Date("2026-10-06T10:00:00Z");
const session: StudySession = {
  id: "50000000-0000-4000-8000-000000000001",
  ownerId: "owner",
  courseId: "saved-course",
  scope: { deckIds: ["saved-deck"] },
  status: "active",
  startedAt: now,
  endedAt: null,
};
const input = { ownerId: "owner", sessionId: session.id, now, timeZone: "Europe/Madrid" };
function repositories() {
  const sessions: StudySessionRepository = {
    get: vi.fn().mockResolvedValue(session),
    create: vi.fn(),
  };
  const queue: DailyQueueRepository = {
    getCourseLimits: vi.fn().mockResolvedValue({ dailyNewLimit: 2, maximumReviewsPerDay: 1 }),
    listEligibleItems: vi.fn().mockResolvedValue([
      { practiceItemId: "new", phase: null, dueAt: null, learningStateId: null, revision: null },
      {
        practiceItemId: "review",
        phase: "review",
        dueAt: now,
        learningStateId: "state",
        revision: 1,
      },
    ]),
    countTodayActivity: vi.fn().mockResolvedValue({ newIntroduced: 0, reviewsDone: 0 }),
    getTimeZone: vi.fn(),
  };
  const cards: StudyCardRepository = {
    findContent: vi.fn().mockResolvedValue({
      mode: "cloze",
      promptText: "I ___ to work.",
      hintText: "A verb",
      answerText: "Secret sentence",
      clozeAnswers: ["Secret solution"],
      exampleText: "Secret example",
      explanationText: "Secret explanation",
    }),
  };
  return { sessions, queue, cards };
}
describe("getStudySessionCard", () => {
  it("loads only the first ordered item using the saved course/scope, and returns only its front", async () => {
    const { sessions, queue, cards } = repositories();
    const result = await getStudySessionCard(sessions, queue, cards, input);
    expect(result.ok && result.card).toEqual({
      practiceItemId: "review",
      prompt: { mode: "cloze", promptText: "I ___ to work.", hintText: "A verb" },
    });
    expect(cards.findContent).toHaveBeenCalledExactlyOnceWith({
      ownerId: "owner",
      courseId: "saved-course",
      practiceItemId: "review",
    });
    expect(queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "saved-course",
      deckIds: ["saved-deck"],
    });
    expect(JSON.stringify(result)).not.toContain("Secret");
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it("does not read content for a missing or another owner's session", async () => {
    const { sessions, queue, cards } = repositories();
    vi.mocked(sessions.get).mockResolvedValue(null);
    expect(await getStudySessionCard(sessions, queue, cards, input)).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(cards.findContent).not.toHaveBeenCalled();
    expect(queue.listEligibleItems).not.toHaveBeenCalled();
  });
  it("rejects malformed session IDs before any reads", async () => {
    const { sessions, queue, cards } = repositories();
    expect(
      await getStudySessionCard(sessions, queue, cards, { ...input, sessionId: "bad" }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(sessions.get).not.toHaveBeenCalled();
    expect(cards.findContent).not.toHaveBeenCalled();
  });
  it.each(["paused", "completed", "abandoned"] as const)(
    "never loads a card for a %s session",
    async (status) => {
      const { sessions, queue, cards } = repositories();
      vi.mocked(sessions.get).mockResolvedValue({
        ...session,
        status,
        endedAt: status === "paused" ? null : now,
      });
      const result = await getStudySessionCard(sessions, queue, cards, input);
      expect(result.ok && result.card).toBeNull();
      expect(cards.findContent).not.toHaveBeenCalled();
      expect(queue.listEligibleItems).not.toHaveBeenCalled();
    },
  );
  it("does not load a card when limits leave no available item", async () => {
    const { sessions, queue, cards } = repositories();
    vi.mocked(queue.countTodayActivity).mockResolvedValue({ newIntroduced: 2, reviewsDone: 1 });
    const result = await getStudySessionCard(sessions, queue, cards, input);
    expect(result.ok && result.queue?.entries).toHaveLength(0);
    expect(result.ok && result.card).toBeNull();
    expect(cards.findContent).not.toHaveBeenCalled();
  });
  it("does not silently substitute a new item when the first item disappears", async () => {
    const { sessions, queue, cards } = repositories();
    vi.mocked(cards.findContent).mockResolvedValue(null);
    const result = await getStudySessionCard(sessions, queue, cards, input);
    expect(result.ok && result.card).toBeNull();
    expect(cards.findContent).toHaveBeenCalledTimes(1);
  });
  it("propagates repository errors instead of returning an empty success", async () => {
    const { sessions, queue, cards } = repositories();
    vi.mocked(cards.findContent).mockRejectedValue(new StudyError("unavailable", "read failed"));
    await expect(getStudySessionCard(sessions, queue, cards, input)).rejects.toMatchObject({
      kind: "unavailable",
    });
  });
});

describe("revealStudySessionCard", () => {
  it("reveals the same first item, with solutions and optional concept context, without writing", async () => {
    const { sessions, queue, cards } = repositories();
    const result = await revealStudySessionCard(sessions, queue, cards, {
      ...input,
      practiceItemId: "review",
    });
    expect(result).toMatchObject({
      ok: true,
      practiceItemId: "review",
      content: {
        answerText: "Secret sentence",
        clozeAnswers: ["Secret solution"],
        exampleText: "Secret example",
        explanationText: "Secret explanation",
      },
    });
    expect(cards.findContent).toHaveBeenCalledExactlyOnceWith({
      ownerId: "owner",
      courseId: "saved-course",
      practiceItemId: "review",
    });
    expect(sessions.create).not.toHaveBeenCalled();
  });
  it.each(["new", "foreign", null, "", { bad: true }])(
    "does not disclose an arbitrary or non-first ID (%j)",
    async (practiceItemId) => {
      const { sessions, queue, cards } = repositories();
      expect(
        await revealStudySessionCard(sessions, queue, cards, { ...input, practiceItemId }),
      ).toEqual({ ok: false, reason: "card-changed" });
      expect(cards.findContent).not.toHaveBeenCalled();
    },
  );
  it("does not read content for an absent or foreign session", async () => {
    const { sessions, queue, cards } = repositories();
    vi.mocked(sessions.get).mockResolvedValue(null);
    expect(
      await revealStudySessionCard(sessions, queue, cards, { ...input, practiceItemId: "review" }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(cards.findContent).not.toHaveBeenCalled();
  });
  it.each(["paused", "completed", "abandoned"] as const)(
    "does not reveal from a %s session",
    async (status) => {
      const { sessions, queue, cards } = repositories();
      vi.mocked(sessions.get).mockResolvedValue({ ...session, status });
      expect(
        await revealStudySessionCard(sessions, queue, cards, {
          ...input,
          practiceItemId: "review",
        }),
      ).toEqual({ ok: false, reason: "card-changed" });
      expect(cards.findContent).not.toHaveBeenCalled();
    },
  );
  it("rechecks live daily limits instead of revealing a stale front", async () => {
    const { sessions, queue, cards } = repositories();
    vi.mocked(queue.countTodayActivity).mockResolvedValue({ newIntroduced: 2, reviewsDone: 1 });
    expect(
      await revealStudySessionCard(sessions, queue, cards, { ...input, practiceItemId: "review" }),
    ).toEqual({ ok: false, reason: "card-changed" });
    expect(cards.findContent).not.toHaveBeenCalled();
  });
  it("handles content removed between queue and content reads without substitution", async () => {
    const { sessions, queue, cards } = repositories();
    vi.mocked(cards.findContent).mockResolvedValue(null);
    expect(
      await revealStudySessionCard(sessions, queue, cards, { ...input, practiceItemId: "review" }),
    ).toEqual({ ok: false, reason: "card-changed" });
    expect(cards.findContent).toHaveBeenCalledTimes(1);
  });
  it("propagates read failures and rejects invalid timezone/session ID", async () => {
    const { sessions, queue, cards } = repositories();
    expect(
      await revealStudySessionCard(sessions, queue, cards, {
        ...input,
        sessionId: "bad",
        practiceItemId: "review",
      }),
    ).toEqual({ ok: false, reason: "not-found" });
    expect(
      await revealStudySessionCard(sessions, queue, cards, {
        ...input,
        timeZone: "bad",
        practiceItemId: "review",
      }),
    ).toEqual({ ok: false, reason: "invalid-timezone" });
    vi.mocked(cards.findContent).mockRejectedValue(new StudyError("unavailable", "read failed"));
    await expect(
      revealStudySessionCard(sessions, queue, cards, { ...input, practiceItemId: "review" }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });
});
