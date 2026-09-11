import { describe, expect, it, vi } from "vitest";

import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import type { LearningState } from "@/modules/study/domain/memory";
import type { LearningStateRepository, StoredLearningState } from "./learning-state";
import { reviewPracticeItem } from "./review-practice-item";
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

const baseInput = {
  ownerId: "user-1",
  practiceItemId: "item-1",
  rating: "good" as const,
  expectedRevision: 1,
  now: NOW,
  config: V1_SCHEDULER_CONFIG,
};

describe("reviewPracticeItem", () => {
  it("rechaza un identificador de usuario vacío", async () => {
    await expect(
      reviewPracticeItem(fakeRepository(), fakeScheduler(), { ...baseInput, ownerId: "" }),
    ).rejects.toThrow(/sin identificador de usuario/);
  });

  it("rechaza una valoración que no es de usuario (p. ej. manual)", async () => {
    const scheduler = fakeScheduler();
    const outcome = await reviewPracticeItem(fakeRepository(), scheduler, {
      ...baseInput,
      rating: "manual",
    });
    expect(outcome).toEqual({ ok: false, reason: "invalid-rating" });
    expect(scheduler.review).not.toHaveBeenCalled();
  });

  it("deriva el estado, llama al adaptador y no escribe", async () => {
    const repository = fakeRepository();
    const scheduler = fakeScheduler();

    const outcome = await reviewPracticeItem(repository, scheduler, baseInput);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.rating).toBe("good");
    expect(outcome.transition.state.phase).toBe("learning");
    expect(outcome.transition.state.dueAt).toEqual(LATER);
    expect(outcome.preview.map((item) => item.rating)).toEqual(["again", "hard", "good", "easy"]);
    expect(scheduler.review).toHaveBeenCalledWith(newSnapshot, "good", NOW, V1_SCHEDULER_CONFIG);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("no valora un ítem inexistente o archivado, ni uno sin estado", async () => {
    const missing = await reviewPracticeItem(
      fakeRepository({ findPracticeItem: vi.fn().mockResolvedValue(null) }),
      fakeScheduler(),
      baseInput,
    );
    expect(missing).toEqual({ ok: false, reason: "not-found" });

    const archived = await reviewPracticeItem(
      fakeRepository({
        findPracticeItem: vi
          .fn()
          .mockResolvedValue({ id: "item-1", archivedAt: NOW.toISOString() }),
      }),
      fakeScheduler(),
      baseInput,
    );
    expect(archived).toEqual({ ok: false, reason: "archived" });

    const noState = await reviewPracticeItem(
      fakeRepository({ getByItem: vi.fn().mockResolvedValue(null) }),
      fakeScheduler(),
      baseInput,
    );
    expect(noState).toEqual({ ok: false, reason: "no-state" });
  });

  it("si la revision esperada no coincide, no llama al adaptador", async () => {
    const scheduler = fakeScheduler();
    const outcome = await reviewPracticeItem(fakeRepository(), scheduler, {
      ...baseInput,
      expectedRevision: 2,
    });
    expect(outcome).toEqual({ ok: false, reason: "revision-conflict" });
    expect(scheduler.review).not.toHaveBeenCalled();
  });
});
