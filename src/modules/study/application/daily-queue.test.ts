import { describe, expect, it, vi } from "vitest";

import { getDailyQueue, type DailyQueueRepository } from "./daily-queue";
import type { QueueCandidate } from "@/modules/study/domain/queue";

const NOW = new Date("2026-09-11T10:00:00.000Z");
const MADRID_DAY_START = new Date("2026-09-10T22:00:00.000Z");
const MADRID_DAY_END = new Date("2026-09-11T22:00:00.000Z");

function candidate(id: string, phase: QueueCandidate["phase"]): QueueCandidate {
  return {
    practiceItemId: id,
    phase,
    dueAt: phase === "new" || phase === null ? NOW : new Date("2026-09-11T09:00:00.000Z"),
    learningStateId: phase ? `s-${id}` : null,
    revision: phase ? 1 : null,
  };
}

function fakeRepository(overrides: Partial<DailyQueueRepository> = {}): DailyQueueRepository {
  return {
    getCourseLimits: vi.fn().mockResolvedValue({
      dailyNewLimit: 5,
      maximumReviewsPerDay: null,
    }),
    listEligibleItems: vi.fn().mockResolvedValue([]),
    countTodayActivity: vi.fn().mockResolvedValue({ newIntroduced: 0, reviewsDone: 0 }),
    getTimeZone: vi.fn().mockResolvedValue("Europe/Madrid"),
    ...overrides,
  };
}

const baseInput = {
  ownerId: "user-1",
  courseId: "course-1",
  now: NOW,
  timeZone: "Europe/Madrid",
};

describe("getDailyQueue", () => {
  it("rechaza un identificador de usuario vacío", async () => {
    await expect(getDailyQueue(fakeRepository(), { ...baseInput, ownerId: "  " })).rejects.toThrow(
      /sin identificador de usuario/,
    );
  });

  it("devuelve not-found si el curso no existe para el dueño", async () => {
    const repository = fakeRepository({
      getCourseLimits: vi.fn().mockResolvedValue(null),
    });

    const outcome = await getDailyQueue(repository, baseInput);

    expect(outcome).toEqual({ ok: false, reason: "not-found" });
    expect(repository.listEligibleItems).not.toHaveBeenCalled();
  });

  it("arma la cola con los candidatos y los cupos de hoy", async () => {
    const repository = fakeRepository({
      getCourseLimits: vi.fn().mockResolvedValue({
        dailyNewLimit: 2,
        maximumReviewsPerDay: 10,
      }),
      listEligibleItems: vi
        .fn()
        .mockResolvedValue([
          candidate("l1", "learning"),
          candidate("r1", "review"),
          candidate("n1", null),
          candidate("n2", "new"),
          candidate("n3", null),
        ]),
      countTodayActivity: vi.fn().mockResolvedValue({ newIntroduced: 1, reviewsDone: 0 }),
    });

    const outcome = await getDailyQueue(repository, baseInput);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.queue.entries.map((e) => e.practiceItemId)).toEqual(["l1", "r1", "n1"]);
    expect(outcome.queue.hiddenNew).toBe(2);
    expect(repository.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "user-1",
      courseId: "course-1",
      deckIds: null,
    });
  });

  it("un array vacío de mazos no se interpreta como todos", async () => {
    const repository = fakeRepository();

    await getDailyQueue(repository, { ...baseInput, deckIds: [] });

    expect(repository.listEligibleItems).toHaveBeenCalledWith({
      ownerId: "user-1",
      courseId: "course-1",
      deckIds: [],
    });
  });

  it("cuenta la actividad del día local Europe/Madrid, no de medianoche UTC", async () => {
    const repository = fakeRepository();

    await getDailyQueue(repository, baseInput);

    expect(repository.countTodayActivity).toHaveBeenCalledWith({
      ownerId: "user-1",
      dayStart: MADRID_DAY_START,
      dayEnd: MADRID_DAY_END,
    });
  });

  it("rechaza una zona IANA inventada", async () => {
    const repository = fakeRepository();
    const outcome = await getDailyQueue(repository, {
      ...baseInput,
      timeZone: "Mars/Olympus",
    });
    expect(outcome).toEqual({ ok: false, reason: "invalid-timezone" });
    expect(repository.countTodayActivity).not.toHaveBeenCalled();
  });
});
