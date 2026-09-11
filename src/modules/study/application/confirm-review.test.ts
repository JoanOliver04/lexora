import { describe, expect, it, vi } from "vitest";

import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import type { LearningState } from "@/modules/study/domain/memory";
import type { LearningStateRepository, StoredLearningState } from "./learning-state";
import { confirmReview, learningStateSnapshot, type ReviewCommitter } from "./confirm-review";
import type { SpacedRepetitionScheduler } from "./spaced-repetition-scheduler";

const NOW = new Date("2026-09-11T10:00:00.000Z");
const LATER = new Date("2026-09-11T10:10:00.000Z");

const newSnapshot: LearningState = {
  phase: "new",
  dueAt: NOW,
  lastReviewedAt: null,
  stability: 0,
  difficulty: 0,
  scheduledDays: 0,
  learningStep: 0,
  reps: 0,
  lapses: 0,
};

const afterGood: LearningState = {
  ...newSnapshot,
  phase: "learning",
  dueAt: LATER,
  lastReviewedAt: NOW,
  learningStep: 1,
  reps: 1,
  stability: 2.3065,
};

const stored: StoredLearningState = {
  id: "state-1",
  ownerId: "user-1",
  practiceItemId: "item-1",
  revision: 1,
  schedulerVersion: "5.4.2",
  configVersion: "v1",
  createdAt: NOW.toISOString(),
  updatedAt: NOW.toISOString(),
  state: newSnapshot,
};

const storedAfter: StoredLearningState = {
  ...stored,
  revision: 2,
  state: afterGood,
};

function fakeRepository(overrides: Partial<LearningStateRepository> = {}): LearningStateRepository {
  return {
    getByItem: vi.fn().mockResolvedValue(stored),
    findPracticeItem: vi.fn().mockResolvedValue({ id: "item-1", archivedAt: null }),
    create: vi.fn(),
    ...overrides,
  };
}

function fakeScheduler(
  overrides: Partial<SpacedRepetitionScheduler> = {},
): SpacedRepetitionScheduler {
  return {
    createInitialState: vi.fn(),
    preview: vi.fn().mockReturnValue([
      { rating: "again", state: newSnapshot },
      { rating: "hard", state: newSnapshot },
      { rating: "good", state: afterGood },
      { rating: "easy", state: newSnapshot },
    ]),
    review: vi.fn().mockReturnValue({
      state: afterGood,
      rating: "good",
      reviewedAt: NOW,
    }),
    ...overrides,
  };
}

function fakeCommitter(overrides: Partial<ReviewCommitter> = {}): ReviewCommitter {
  return {
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    commit: vi.fn().mockResolvedValue({ ok: true, replayed: false }),
    ...overrides,
  };
}

const baseInput = {
  ownerId: "user-1",
  practiceItemId: "item-1",
  rating: "good" as const,
  expectedRevision: 1,
  idempotencyKey: "idem-1",
  now: NOW,
  config: V1_SCHEDULER_CONFIG,
};

describe("confirmReview", () => {
  it("si el cálculo falla, no llama al committer", async () => {
    const committer = fakeCommitter();
    const outcome = await confirmReview(fakeRepository(), fakeScheduler(), committer, {
      ...baseInput,
      rating: "manual",
    });
    expect(outcome).toEqual({ ok: false, reason: "invalid-rating" });
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it("no confirma un ítem inexistente, archivado, sin estado o con revision distinta", async () => {
    const committer = fakeCommitter();

    const missing = await confirmReview(
      fakeRepository({ findPracticeItem: vi.fn().mockResolvedValue(null) }),
      fakeScheduler(),
      committer,
      baseInput,
    );
    expect(missing).toEqual({ ok: false, reason: "not-found" });

    const archived = await confirmReview(
      fakeRepository({
        findPracticeItem: vi
          .fn()
          .mockResolvedValue({ id: "item-1", archivedAt: NOW.toISOString() }),
      }),
      fakeScheduler(),
      committer,
      baseInput,
    );
    expect(archived).toEqual({ ok: false, reason: "archived" });

    const noState = await confirmReview(
      fakeRepository({ getByItem: vi.fn().mockResolvedValue(null) }),
      fakeScheduler(),
      committer,
      baseInput,
    );
    expect(noState).toEqual({ ok: false, reason: "no-state" });

    const conflict = await confirmReview(fakeRepository(), fakeScheduler(), committer, {
      ...baseInput,
      expectedRevision: 2,
    });
    expect(conflict).toEqual({
      ok: false,
      reason: "revision-conflict",
      current: stored,
    });

    expect(committer.commit).not.toHaveBeenCalled();
  });

  it("calcula, confirma y relee el estado persistido", async () => {
    const repository = fakeRepository({
      getByItem: vi.fn().mockResolvedValueOnce(stored).mockResolvedValueOnce(storedAfter),
    });
    const scheduler = fakeScheduler();
    const committer = fakeCommitter();

    const outcome = await confirmReview(repository, scheduler, committer, baseInput);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.stored.revision).toBe(2);
    expect(outcome.replayed).toBe(false);
    expect(outcome.rating).toBe("good");
    expect(outcome.transition.state.dueAt).toEqual(LATER);
    expect(committer.commit).toHaveBeenCalledWith({
      ownerId: "user-1",
      practiceItemId: "item-1",
      expectedRevision: 1,
      idempotencyKey: "idem-1",
      rating: "good",
      reviewedAt: NOW,
      previous: newSnapshot,
      next: afterGood,
      schedulerVersion: "5.4.2",
      configVersion: "v1",
      studySessionId: null,
      durationMs: null,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("si el committer informa conflicto, no finge éxito y relee el estado", async () => {
    const repository = fakeRepository({
      getByItem: vi.fn().mockResolvedValueOnce(stored).mockResolvedValueOnce(storedAfter),
    });
    const committer = fakeCommitter({
      commit: vi.fn().mockResolvedValue({ ok: false, reason: "revision-conflict" }),
    });
    const outcome = await confirmReview(repository, fakeScheduler(), committer, baseInput);
    expect(outcome).toEqual({
      ok: false,
      reason: "revision-conflict",
      current: storedAfter,
    });
    expect(committer.commit).toHaveBeenCalled();
  });

  it("dos dispositivos con la misma revision: el segundo recibe el estado ganador", async () => {
    const repository = fakeRepository({
      getByItem: vi
        .fn()
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(storedAfter)
        .mockResolvedValueOnce(stored)
        .mockResolvedValueOnce(storedAfter),
    });
    const committer = fakeCommitter({
      commit: vi
        .fn()
        .mockResolvedValueOnce({ ok: true, replayed: false })
        .mockResolvedValueOnce({ ok: false, reason: "revision-conflict" }),
    });
    const scheduler = fakeScheduler();

    const first = await confirmReview(repository, scheduler, committer, {
      ...baseInput,
      idempotencyKey: "device-a",
    });
    const second = await confirmReview(repository, scheduler, committer, {
      ...baseInput,
      rating: "again",
      idempotencyKey: "device-b",
    });

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.replayed).toBe(false);
    expect(second).toEqual({
      ok: false,
      reason: "revision-conflict",
      current: storedAfter,
    });
    if (!second.ok && second.reason === "revision-conflict") {
      expect(second.current.revision).toBe(2);
    }
  });

  it("un reenvío replayed sigue siendo éxito", async () => {
    const repository = fakeRepository({
      getByItem: vi.fn().mockResolvedValueOnce(stored).mockResolvedValueOnce(storedAfter),
    });
    const committer = fakeCommitter({
      commit: vi.fn().mockResolvedValue({ ok: true, replayed: true }),
    });
    const outcome = await confirmReview(repository, fakeScheduler(), committer, baseInput);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.replayed).toBe(true);
    expect(outcome.stored.revision).toBe(2);
  });

  it("rechaza una clave de idempotencia vacía o demasiado larga", async () => {
    const committer = fakeCommitter();
    const empty = await confirmReview(fakeRepository(), fakeScheduler(), committer, {
      ...baseInput,
      idempotencyKey: "   ",
    });
    expect(empty).toEqual({ ok: false, reason: "invalid-idempotency-key" });
    expect(committer.findByIdempotencyKey).not.toHaveBeenCalled();
    expect(committer.commit).not.toHaveBeenCalled();
  });

  it("un reintento con la misma clave reexpide sin calcular ni escribir", async () => {
    const repository = fakeRepository({
      getByItem: vi.fn().mockResolvedValue(storedAfter),
    });
    const scheduler = fakeScheduler();
    const committer = fakeCommitter({
      findByIdempotencyKey: vi.fn().mockResolvedValue({
        practiceItemId: "item-1",
        rating: "good" as const,
        reviewedAt: NOW,
      }),
    });

    const outcome = await confirmReview(repository, scheduler, committer, {
      ...baseInput,
      rating: "again",
      expectedRevision: 1,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.replayed).toBe(true);
    expect(outcome.rating).toBe("good");
    expect(outcome.stored.revision).toBe(2);
    expect(outcome.transition.state.dueAt).toEqual(LATER);
    expect(scheduler.review).not.toHaveBeenCalled();
    expect(committer.commit).not.toHaveBeenCalled();
    expect(scheduler.preview).toHaveBeenCalledWith(afterGood, NOW, V1_SCHEDULER_CONFIG);
  });
});

describe("learningStateSnapshot", () => {
  it("serializa fechas a ISO y lastReviewedAt nulo", () => {
    expect(learningStateSnapshot(newSnapshot)).toEqual({
      phase: "new",
      dueAt: NOW.toISOString(),
      lastReviewedAt: null,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
      learningStep: 0,
      reps: 0,
      lapses: 0,
    });
  });
});
