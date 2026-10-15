import { describe, expect, it, vi } from "vitest";

import type { LearningState, ReviewRating } from "@/modules/study/domain/memory";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import type { CommitReviewResult, ReplayLookup, ReviewCommitter } from "./confirm-review";
import type { DailyQueueRepository } from "./daily-queue";
import type { LearningStateRepository, StoredLearningState } from "./learning-state";
import { saveSessionReview } from "./save-session-review";
import type { SpacedRepetitionScheduler } from "./spaced-repetition-scheduler";
import type { StudyCardRepository } from "./study-card";
import { StudyError } from "./study-error";
import type { StudySession, StudySessionRepository } from "./study-session";

const now = new Date("2026-10-11T10:00:00Z");
const itemId = "20000000-0000-4000-8000-000000000001";
const sessionId = "50000000-0000-4000-8000-000000000001";
const key = "60000000-0000-4000-8000-000000000001";
const session: StudySession = {
  id: sessionId,
  ownerId: "owner",
  courseId: "saved-course",
  scope: { deckIds: ["saved-deck"] },
  status: "active",
  startedAt: now,
  endedAt: null,
};
const input = {
  ownerId: "owner",
  sessionId,
  practiceItemId: itemId,
  idempotencyKey: key,
  expectedRevision: null,
  rating: "good",
  now,
  timeZone: "Europe/Madrid",
  config: V1_SCHEDULER_CONFIG,
};
const initial: LearningState = {
  phase: "new",
  dueAt: now,
  lastReviewedAt: null,
  stability: 0,
  difficulty: 0,
  scheduledDays: 0,
  learningStep: 0,
  reps: 0,
  lapses: 0,
};
function fixture() {
  let stored: StoredLearningState | null = null;
  const logs = new Map<string, ReplayLookup>();
  const sessions: StudySessionRepository = {
    get: vi.fn().mockResolvedValue(session),
    create: vi.fn(),
  };
  const queue: DailyQueueRepository = {
    getCourseLimits: vi.fn().mockResolvedValue({ dailyNewLimit: 5, maximumReviewsPerDay: null }),
    listEligibleItems: vi.fn(async () => [
      {
        practiceItemId: itemId,
        phase: stored?.state.phase ?? null,
        dueAt: stored?.state.dueAt ?? null,
        learningStateId: stored?.id ?? null,
        revision: stored?.revision ?? null,
      },
    ]),
    countTodayActivity: vi.fn(async () => ({ newIntroduced: logs.size, reviewsDone: 0 })),
    getTimeZone: vi.fn(),
  };
  const cards: StudyCardRepository = {
    findContent: vi.fn().mockResolvedValue({
      mode: "basic_recall",
      promptText: "Original prompt",
      answerText: "PRIVATE_ANSWER",
      hintText: null,
      exampleText: null,
      explanationText: null,
    }),
  };
  const memory: LearningStateRepository = {
    getByItem: vi.fn(async () => stored),
    findPracticeItem: vi.fn().mockResolvedValue({ id: itemId, archivedAt: null }),
    create: vi.fn(async (command: Parameters<LearningStateRepository["create"]>[0]) => {
      stored = {
        id: "state",
        ownerId: command.ownerId,
        practiceItemId: command.practiceItemId,
        revision: 1,
        schedulerVersion: command.schedulerVersion,
        configVersion: command.configVersion,
        state: command.state,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
      return stored;
    }),
  };
  const scheduler: SpacedRepetitionScheduler = {
    createInitialState: vi.fn(() => initial),
    preview: vi.fn(() => []),
    review: vi.fn((state: LearningState, rating: ReviewRating) => ({
      rating,
      reviewedAt: now,
      state: {
        ...state,
        phase: "learning" as const,
        dueAt: new Date(now.getTime() + 600_000),
        lastReviewedAt: now,
        reps: state.reps + 1,
        stability: 2,
        difficulty: 4,
      },
    })),
  };
  const committer: ReviewCommitter = {
    findByIdempotencyKey: vi.fn(async ({ idempotencyKey }) => logs.get(idempotencyKey) ?? null),
    commit: vi.fn(
      async (command: Parameters<ReviewCommitter["commit"]>[0]): Promise<CommitReviewResult> => {
        if (logs.has(command.idempotencyKey)) return { ok: true, replayed: true };
        if (!stored) return { ok: false, reason: "not-found" };
        if (stored.revision !== command.expectedRevision)
          return { ok: false, reason: "revision-conflict" };
        stored = { ...stored, revision: stored.revision + 1, state: command.next };
        logs.set(command.idempotencyKey, {
          practiceItemId: command.practiceItemId,
          studySessionId: command.studySessionId,
          rating: command.rating,
          reviewedAt: command.reviewedAt,
        });
        return { ok: true, replayed: false };
      },
    ),
  };
  return { sessions, queue, cards, memory, scheduler, committer, logs, getStored: () => stored };
}

describe("saveSessionReview", () => {
  it("authorizes the saved scope, creates new memory only on rating, and confirms one atomic review", async () => {
    const f = fixture();
    expect(await saveSessionReview(f, input)).toEqual({
      ok: true,
      rating: "good",
      replayed: false,
    });
    expect(f.queue.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "saved-course",
      deckIds: ["saved-deck"],
    });
    expect(f.cards.findContent).toHaveBeenCalledWith({
      ownerId: "owner",
      courseId: "saved-course",
      practiceItemId: itemId,
    });
    expect(f.committer.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: "owner",
        studySessionId: sessionId,
        practiceItemId: itemId,
        expectedRevision: 1,
        idempotencyKey: key,
        reviewedAt: now,
        durationMs: null,
      }),
    );
    expect(f.getStored()).toMatchObject({ revision: 2, state: { phase: "learning", reps: 1 } });
    expect(f.logs.size).toBe(1);
  });
  it("acknowledges the same intent after its card has left the queue without calculating or writing again", async () => {
    const f = fixture();
    await saveSessionReview(f, input);
    vi.mocked(f.queue.listEligibleItems).mockClear();
    expect(await saveSessionReview(f, input)).toEqual({ ok: true, rating: "good", replayed: true });
    expect(f.queue.listEligibleItems).not.toHaveBeenCalled();
    expect(f.scheduler.review).toHaveBeenCalledTimes(1);
    expect(f.committer.commit).toHaveBeenCalledTimes(1);
    expect(f.logs.size).toBe(1);
  });
  it.each([
    { sessionId: "bad" },
    { practiceItemId: "bad" },
    { idempotencyKey: "bad" },
    { rating: "manual" },
    { expectedRevision: -1 },
    { expectedRevision: 0 },
    { expectedRevision: 1.5 },
    { expectedRevision: "1" },
    { expectedRevision: 2_147_483_648 },
  ])("rejects malformed intent before reads or writes: %j", async (change) => {
    const f = fixture();
    expect(await saveSessionReview(f, { ...input, ...change })).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(f.sessions.get).not.toHaveBeenCalled();
    expect(f.memory.create).not.toHaveBeenCalled();
    expect(f.committer.commit).not.toHaveBeenCalled();
  });
  it("rejects absent identity, absent sessions and a mismatched session owner", async () => {
    const f = fixture();
    await expect(saveSessionReview(f, { ...input, ownerId: " " })).rejects.toThrow(
      "verified owner",
    );
    vi.mocked(f.sessions.get).mockResolvedValue(null);
    expect(await saveSessionReview(f, input)).toEqual({ ok: false, reason: "not-found" });
    vi.mocked(f.sessions.get).mockResolvedValue({ ...session, ownerId: "other" });
    expect(await saveSessionReview(f, input)).toEqual({ ok: false, reason: "not-found" });
    expect(f.committer.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(f.memory.create).not.toHaveBeenCalled();
  });
  it.each(["paused", "completed", "abandoned"] as const)(
    "does not mutate a %s session",
    async (status) => {
      const f = fixture();
      vi.mocked(f.sessions.get).mockResolvedValue({ ...session, status });
      expect(await saveSessionReview(f, input)).toEqual({ ok: false, reason: "inactive-session" });
      expect(f.queue.listEligibleItems).not.toHaveBeenCalled();
      expect(f.memory.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { practiceItemId: "other-item" },
    { studySessionId: "other-session" },
    { studySessionId: null },
    { rating: "easy" as const },
  ])("does not acknowledge another intent's receipt: %j", async (change) => {
    const f = fixture();
    f.logs.set(key, {
      practiceItemId: itemId,
      studySessionId: sessionId,
      rating: "good",
      reviewedAt: now,
      ...change,
    });
    expect(await saveSessionReview(f, input)).toEqual({
      ok: false,
      reason: "idempotency-conflict",
    });
    expect(f.queue.listEligibleItems).not.toHaveBeenCalled();
    expect(f.committer.commit).not.toHaveBeenCalled();
  });
  it("rejects a non-first card, exhausted daily limits, and removed content before creating memory", async () => {
    const f = fixture();
    expect(
      await saveSessionReview(f, {
        ...input,
        practiceItemId: "20000000-0000-4000-8000-000000000002",
      }),
    ).toEqual({ ok: false, reason: "card-changed" });
    vi.mocked(f.queue.countTodayActivity).mockResolvedValue({ newIntroduced: 5, reviewsDone: 0 });
    expect(await saveSessionReview(f, input)).toEqual({ ok: false, reason: "card-changed" });
    vi.mocked(f.queue.countTodayActivity).mockResolvedValue({ newIntroduced: 0, reviewsDone: 0 });
    vi.mocked(f.cards.findContent).mockResolvedValue(null);
    expect(await saveSessionReview(f, input)).toEqual({ ok: false, reason: "card-changed" });
    expect(f.memory.create).not.toHaveBeenCalled();
    expect(f.committer.commit).not.toHaveBeenCalled();
  });
  it("rejects an invalid timezone without writing", async () => {
    const f = fixture();
    expect(await saveSessionReview(f, { ...input, timeZone: "invalid" })).toEqual({
      ok: false,
      reason: "invalid-timezone",
    });
    expect(f.memory.create).not.toHaveBeenCalled();
  });
  it("does not recreate missing memory for an observed revision", async () => {
    const f = fixture();
    expect(await saveSessionReview(f, { ...input, expectedRevision: 1 })).toEqual({
      ok: false,
      reason: "card-changed",
    });
    expect(f.memory.create).not.toHaveBeenCalled();
    expect(f.committer.commit).not.toHaveBeenCalled();
  });
  it("does not fast-forward a stale revision or migrate incompatible memory", async () => {
    const f = fixture();
    await f.memory.create({
      ownerId: "owner",
      practiceItemId: itemId,
      state: initial,
      schedulerVersion: "5.4.2",
      configVersion: "v1",
    });
    const stored = f.getStored()!;
    stored.revision = 2;
    expect(await saveSessionReview(f, input)).toEqual({ ok: false, reason: "revision-conflict" });
    stored.revision = 1;
    stored.configVersion = "future";
    expect(await saveSessionReview(f, { ...input, expectedRevision: 1 })).toEqual({
      ok: false,
      reason: "scheduler-mismatch",
    });
    expect(f.committer.commit).not.toHaveBeenCalled();
  });
  it("rechecks the canonical receipt when another request wins an idempotency race", async () => {
    const f = fixture();
    vi.mocked(f.committer.commit).mockImplementation(async () => {
      f.logs.set(key, {
        practiceItemId: itemId,
        studySessionId: "other-session",
        rating: "good",
        reviewedAt: now,
      });
      return { ok: true, replayed: true };
    });
    expect(await saveSessionReview(f, input)).toEqual({
      ok: false,
      reason: "idempotency-conflict",
    });
  });
  it("preserves a committed record when the acknowledgement read fails, then safely replays", async () => {
    const f = fixture();
    vi.mocked(f.memory.getByItem).mockImplementation(async () => {
      if (f.logs.size) throw new StudyError("unavailable", "Read failed after commit");
      return f.getStored();
    });
    await expect(saveSessionReview(f, input)).rejects.toMatchObject({ kind: "unavailable" });
    expect(f.logs.size).toBe(1);
    expect(await saveSessionReview(f, input)).toEqual({ ok: true, rating: "good", replayed: true });
    expect(f.committer.commit).toHaveBeenCalledTimes(1);
  });
  it("recognizes a concurrent committed key when its front disappears during queue loading", async () => {
    const f = fixture();
    vi.mocked(f.queue.listEligibleItems).mockImplementationOnce(async () => {
      f.logs.set(key, {
        practiceItemId: itemId,
        studySessionId: sessionId,
        rating: "good",
        reviewedAt: now,
      });
      return [];
    });
    expect(await saveSessionReview(f, input)).toEqual({ ok: true, rating: "good", replayed: true });
    expect(f.memory.create).not.toHaveBeenCalled();
    expect(f.committer.commit).not.toHaveBeenCalled();
  });
  it("recognizes a concurrent receipt after computation encounters the winner's revision", async () => {
    const f = fixture();
    await f.memory.create({
      ownerId: "owner",
      practiceItemId: itemId,
      state: initial,
      schedulerVersion: "5.4.2",
      configVersion: "v1",
    });
    f.getStored()!.revision = 2;
    vi.mocked(f.committer.findByIdempotencyKey)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        practiceItemId: itemId,
        studySessionId: sessionId,
        rating: "good",
        reviewedAt: now,
      });
    expect(await saveSessionReview(f, { ...input, expectedRevision: 1 })).toEqual({
      ok: true,
      rating: "good",
      replayed: true,
    });
    expect(f.committer.commit).not.toHaveBeenCalled();
  });
});
