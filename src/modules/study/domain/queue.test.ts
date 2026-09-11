import { describe, expect, it } from "vitest";

import { assembleDailyQueue, type QueueCandidate } from "./queue";
import type { MemoryPhase } from "./memory";

const NOW = new Date("2026-09-11T10:00:00.000Z");

function candidate(id: string, phase: MemoryPhase | null, dueAt: Date | null): QueueCandidate {
  return {
    practiceItemId: id,
    phase,
    dueAt,
    learningStateId: phase ? `state-${id}` : null,
    revision: phase ? 1 : null,
  };
}

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000);
}

function minutesAhead(n: number): Date {
  return new Date(NOW.getTime() + n * 60_000);
}

const emptyLimits = {
  now: NOW,
  dailyNewLimit: 5,
  newIntroducedToday: 0,
  maximumReviewsPerDay: null as number | null,
  reviewsDoneToday: 0,
};

describe("assembleDailyQueue", () => {
  it("ordena Learning/Relearning vencidos, luego Review, luego New", () => {
    const queue = assembleDailyQueue({
      ...emptyLimits,
      candidates: [
        candidate("n1", "new", NOW),
        candidate("r1", "review", minutesAgo(5)),
        candidate("l1", "learning", minutesAgo(1)),
        candidate("rl1", "relearning", minutesAgo(2)),
      ],
    });

    expect(queue.entries.map((e) => e.practiceItemId)).toEqual(["rl1", "l1", "r1", "n1"]);
    expect(queue.entries.map((e) => e.group)).toEqual(["learning", "learning", "review", "new"]);
  });

  it("dentro de Learning ordena por vencimiento y desempatá por id", () => {
    const queue = assembleDailyQueue({
      ...emptyLimits,
      candidates: [
        candidate("b", "learning", minutesAgo(1)),
        candidate("a", "learning", minutesAgo(1)),
        candidate("c", "learning", minutesAgo(10)),
      ],
    });

    expect(queue.entries.map((e) => e.practiceItemId)).toEqual(["c", "a", "b"]);
  });

  it("los New se ordenan solo por id, con o sin estado", () => {
    const queue = assembleDailyQueue({
      ...emptyLimits,
      candidates: [candidate("n2", null, null), candidate("n1", "new", NOW)],
    });

    expect(queue.entries.map((e) => e.practiceItemId)).toEqual(["n1", "n2"]);
    expect(queue.entries.map((e) => e.group)).toEqual(["new", "new"]);
  });

  it("recorta New al cupo diario y cuenta los ocultos por PracticeItem", () => {
    const queue = assembleDailyQueue({
      ...emptyLimits,
      dailyNewLimit: 3,
      newIntroducedToday: 2,
      candidates: [
        candidate("n1", null, null),
        candidate("n2", null, null),
        candidate("n3", null, null),
      ],
    });

    expect(queue.entries.map((e) => e.practiceItemId)).toEqual(["n1"]);
    expect(queue.hiddenNew).toBe(2);
    expect(queue.newRemaining).toBe(0);
  });

  it("el límite de repasos recorta solo Review, no Learning", () => {
    const queue = assembleDailyQueue({
      ...emptyLimits,
      maximumReviewsPerDay: 2,
      reviewsDoneToday: 1,
      candidates: [
        candidate("l1", "learning", minutesAgo(1)),
        candidate("r1", "review", minutesAgo(3)),
        candidate("r2", "review", minutesAgo(2)),
        candidate("r3", "review", minutesAgo(1)),
      ],
    });

    expect(queue.entries.map((e) => e.practiceItemId)).toEqual(["l1", "r1"]);
    expect(queue.hiddenDueReviews).toBe(2);
  });

  it("sin límite de repasos (null) no oculta Review vencidos", () => {
    const queue = assembleDailyQueue({
      ...emptyLimits,
      maximumReviewsPerDay: null,
      candidates: [
        candidate("r1", "review", minutesAgo(1)),
        candidate("r2", "review", minutesAgo(2)),
      ],
    });

    expect(queue.entries).toHaveLength(2);
    expect(queue.hiddenDueReviews).toBe(0);
  });

  it("excluye lo que aún no ha vencido y expone el próximo dueAt", () => {
    const later = minutesAhead(10);
    const queue = assembleDailyQueue({
      ...emptyLimits,
      candidates: [
        candidate("l-due", "learning", minutesAgo(1)),
        candidate("l-later", "learning", later),
        candidate("r-later", "review", minutesAhead(30)),
      ],
    });

    expect(queue.entries.map((e) => e.practiceItemId)).toEqual(["l-due"]);
    expect(queue.nextDueAt).toEqual(later);
  });

  it("cupo de nuevos ya agotado no introduce ninguno", () => {
    const queue = assembleDailyQueue({
      ...emptyLimits,
      dailyNewLimit: 5,
      newIntroducedToday: 5,
      candidates: [candidate("n1", null, null)],
    });

    expect(queue.entries).toHaveLength(0);
    expect(queue.hiddenNew).toBe(1);
    expect(queue.newRemaining).toBe(0);
  });
});
