import { describe, expect, it, vi } from "vitest";
import { getRatingIntervalPreview } from "@/modules/study/application/rating-interval-preview";
import type { StoredLearningState } from "@/modules/study/application/learning-state";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import {
  REVIEW_RATINGS,
  type LearningState,
  type MemoryPhase,
} from "@/modules/study/domain/memory";
import { createTsFsrsScheduler } from "@/modules/study/infrastructure/ts-fsrs-scheduler";

const now = new Date("2026-10-06T10:00:00Z");
const input = { ownerId: "owner", practiceItemId: "item", now, config: V1_SCHEDULER_CONFIG };
const scheduler = createTsFsrsScheduler();
function stored(phase: MemoryPhase): StoredLearningState {
  const state: LearningState =
    phase === "new"
      ? scheduler.createInitialState(now, input.config)
      : {
          phase,
          dueAt: now,
          lastReviewedAt: new Date("2026-10-05T10:00:00Z"),
          stability: 8,
          difficulty: 4,
          scheduledDays: 1,
          learningStep: 0,
          reps: 2,
          lapses: phase === "relearning" ? 1 : 0,
        };
  return {
    id: "state",
    ownerId: "owner",
    practiceItemId: "item",
    revision: 3,
    schedulerVersion: "5.4.2",
    configVersion: "v1",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    state,
  };
}
describe("server rating interval preview contract", () => {
  it.each(["new", "learning", "review", "relearning"] as const)(
    "matches the commit scheduler/config/time for %s, with fuzz enabled and no writes",
    async (phase) => {
      const record = stored(phase);
      const before = structuredClone(record);
      const memory = { getByItem: vi.fn().mockResolvedValue(record) };
      const result = await getRatingIntervalPreview(memory, scheduler, input);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("Expected compatible state");
      expect(result.preview).toMatchObject({
        calculatedAt: now.toISOString(),
        fuzzEnabled: true,
        revision: 3,
      });
      expect(result.preview.intervals).toEqual(
        REVIEW_RATINGS.map((rating) => ({
          rating,
          intervalMs:
            scheduler.review(record.state, rating, now, input.config).state.dueAt.getTime() -
            now.getTime(),
        })),
      );
      expect(memory.getByItem).toHaveBeenCalledExactlyOnceWith({
        ownerId: "owner",
        practiceItemId: "item",
      });
      expect(record).toEqual(before);
    },
  );
  it("uses a hypothetical initial state without creating memory for a new item", async () => {
    const memory = { getByItem: vi.fn().mockResolvedValue(null), create: vi.fn() };
    const result = await getRatingIntervalPreview(memory, scheduler, input);
    expect(result.ok && result.preview.revision).toBeNull();
    expect(
      result.ok && result.preview.intervals.find((entry) => entry.rating === "good")?.intervalMs,
    ).toBe(600_000);
    expect(memory.create).not.toHaveBeenCalled();
  });
  it.each([{ schedulerVersion: "future" }, { configVersion: "v2" }])(
    "blocks incompatible memory without changing it (%j)",
    async (versions) => {
      const record = { ...stored("review"), ...versions };
      const spy = vi.spyOn(scheduler, "preview");
      try {
        expect(
          await getRatingIntervalPreview(
            { getByItem: vi.fn().mockResolvedValue(record) },
            scheduler,
            input,
          ),
        ).toEqual({ ok: false, reason: "scheduler-mismatch" });
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    },
  );
  it("requires verified owner and propagates a failed state read", async () => {
    const memory = { getByItem: vi.fn().mockRejectedValue(new Error("read failed")) };
    await expect(
      getRatingIntervalPreview(memory, scheduler, { ...input, ownerId: " " }),
    ).rejects.toThrow("verified owner");
    expect(memory.getByItem).not.toHaveBeenCalled();
    await expect(getRatingIntervalPreview(memory, scheduler, input)).rejects.toThrow("read failed");
  });
});
