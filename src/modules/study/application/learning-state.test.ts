import { describe, expect, it, vi } from "vitest";

import type { SpacedRepetitionScheduler } from "./spaced-repetition-scheduler";
import {
  ensureLearningState,
  type LearningStateRepository,
  type StoredLearningState,
} from "./learning-state";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import { StudyError } from "./study-error";
import type { LearningState } from "@/modules/study/domain/memory";

const NOW = new Date("2026-09-11T10:00:00.000Z");

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

const storedNew: StoredLearningState = {
  id: "state-1",
  ownerId: "user-1",
  practiceItemId: "item-1",
  revision: 1,
  schedulerVersion: "5.4.2",
  configVersion: "v1",
  createdAt: "2026-09-11T10:00:00.000Z",
  updatedAt: "2026-09-11T10:00:00.000Z",
  state: newSnapshot,
};

const storedLearning: StoredLearningState = {
  ...storedNew,
  revision: 2,
  state: {
    ...newSnapshot,
    phase: "learning",
    lastReviewedAt: NOW,
    scheduledDays: 0,
    learningStep: 1,
    reps: 1,
  },
};

function fakeScheduler(
  overrides: Partial<SpacedRepetitionScheduler> = {},
): SpacedRepetitionScheduler {
  return {
    createInitialState: vi.fn().mockReturnValue(newSnapshot),
    preview: vi.fn(),
    review: vi.fn(),
    ...overrides,
  };
}

function fakeRepository(overrides: Partial<LearningStateRepository> = {}): LearningStateRepository {
  return {
    getByItem: vi.fn().mockResolvedValue(null),
    findPracticeItem: vi.fn().mockResolvedValue({ id: "item-1", archivedAt: null }),
    create: vi.fn().mockResolvedValue(storedNew),
    ...overrides,
  };
}

describe("ensureLearningState", () => {
  it("rechaza un identificador de usuario vacío", async () => {
    await expect(
      ensureLearningState(fakeRepository(), fakeScheduler(), {
        ownerId: "  ",
        practiceItemId: "item-1",
        now: NOW,
        config: V1_SCHEDULER_CONFIG,
      }),
    ).rejects.toThrow(/sin identificador de usuario/);
  });

  it("crea un estado New la primera vez que se activa un ítem vivo", async () => {
    const repository = fakeRepository();
    const scheduler = fakeScheduler();

    const outcome = await ensureLearningState(repository, scheduler, {
      ownerId: "user-1",
      practiceItemId: "item-1",
      now: NOW,
      config: V1_SCHEDULER_CONFIG,
    });

    expect(outcome).toEqual({ ok: true, stored: storedNew, created: true });
    expect(scheduler.createInitialState).toHaveBeenCalledOnce();
    expect(scheduler.createInitialState).toHaveBeenCalledWith(NOW, V1_SCHEDULER_CONFIG);
    expect(repository.create).toHaveBeenCalledWith({
      ownerId: "user-1",
      practiceItemId: "item-1",
      state: newSnapshot,
      schedulerVersion: "5.4.2",
      configVersion: "v1",
    });
  });

  it("es idempotente: un segundo ensure no vuelve a llamar al planificador", async () => {
    const repository = fakeRepository({
      getByItem: vi.fn().mockResolvedValue(storedLearning),
    });
    const scheduler = fakeScheduler();

    const outcome = await ensureLearningState(repository, scheduler, {
      ownerId: "user-1",
      practiceItemId: "item-1",
      now: NOW,
      config: V1_SCHEDULER_CONFIG,
    });

    expect(outcome).toEqual({ ok: true, stored: storedLearning, created: false });
    expect(scheduler.createInitialState).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("conserva el estado al reactivar: un ítem restaurado no se reinicia", async () => {
    const repository = fakeRepository({
      getByItem: vi.fn().mockResolvedValue(storedLearning),
      findPracticeItem: vi.fn().mockResolvedValue({ id: "item-1", archivedAt: null }),
    });
    const scheduler = fakeScheduler();

    const outcome = await ensureLearningState(repository, scheduler, {
      ownerId: "user-1",
      practiceItemId: "item-1",
      now: NOW,
      config: V1_SCHEDULER_CONFIG,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.created).toBe(false);
    expect(outcome.stored.state.phase).toBe("learning");
    expect(outcome.stored.revision).toBe(2);
    expect(scheduler.createInitialState).not.toHaveBeenCalled();
  });

  it("si el ítem está archivado y ya hay memoria, la devuelve sin borrar", async () => {
    const repository = fakeRepository({
      getByItem: vi.fn().mockResolvedValue(storedLearning),
      findPracticeItem: vi
        .fn()
        .mockResolvedValue({ id: "item-1", archivedAt: "2026-09-11T12:00:00.000Z" }),
    });
    const scheduler = fakeScheduler();

    const outcome = await ensureLearningState(repository, scheduler, {
      ownerId: "user-1",
      practiceItemId: "item-1",
      now: NOW,
      config: V1_SCHEDULER_CONFIG,
    });

    expect(outcome).toEqual({ ok: true, stored: storedLearning, created: false });
    expect(repository.findPracticeItem).not.toHaveBeenCalled();
    expect(scheduler.createInitialState).not.toHaveBeenCalled();
  });

  it("no crea un New sobre un ítem archivado que nunca se estudió", async () => {
    const repository = fakeRepository({
      findPracticeItem: vi
        .fn()
        .mockResolvedValue({ id: "item-1", archivedAt: "2026-09-11T12:00:00.000Z" }),
    });
    const scheduler = fakeScheduler();

    const outcome = await ensureLearningState(repository, scheduler, {
      ownerId: "user-1",
      practiceItemId: "item-1",
      now: NOW,
      config: V1_SCHEDULER_CONFIG,
    });

    expect(outcome).toEqual({ ok: false, reason: "archived" });
    expect(scheduler.createInitialState).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rechaza un ítem que no existe o no es del dueño", async () => {
    const repository = fakeRepository({
      findPracticeItem: vi.fn().mockResolvedValue(null),
    });

    const outcome = await ensureLearningState(repository, fakeScheduler(), {
      ownerId: "user-1",
      practiceItemId: "missing",
      now: NOW,
      config: V1_SCHEDULER_CONFIG,
    });

    expect(outcome).toEqual({ ok: false, reason: "not-found" });
  });

  it("si dos altas chocan en la unicidad, relee la fila ganadora", async () => {
    const repository = fakeRepository({
      create: vi.fn().mockRejectedValue(new StudyError("duplicate", "choca (código 23505)")),
      getByItem: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(storedNew),
    });
    const scheduler = fakeScheduler();

    const outcome = await ensureLearningState(repository, scheduler, {
      ownerId: "user-1",
      practiceItemId: "item-1",
      now: NOW,
      config: V1_SCHEDULER_CONFIG,
    });

    expect(outcome).toEqual({ ok: true, stored: storedNew, created: false });
    expect(repository.getByItem).toHaveBeenCalledTimes(2);
  });
});
