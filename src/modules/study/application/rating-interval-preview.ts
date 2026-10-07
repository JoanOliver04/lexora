import type { ReviewRating } from "@/modules/study/domain/memory";
import {
  schedulerCompatibility,
  type VersionedSchedulerConfig,
} from "@/modules/study/domain/scheduler-config";
import type { LearningStateRepository } from "./learning-state";
import type { SpacedRepetitionScheduler } from "./spaced-repetition-scheduler";

export interface RatingIntervalPreview {
  calculatedAt: string;
  fuzzEnabled: boolean;
  revision: number | null;
  intervals: { rating: ReviewRating; intervalMs: number }[];
}

/** Called only after session/item authorization. A new state is hypothetical, not persisted. */
export async function getRatingIntervalPreview(
  memory: Pick<LearningStateRepository, "getByItem">,
  scheduler: SpacedRepetitionScheduler,
  input: { ownerId: string; practiceItemId: string; now: Date; config: VersionedSchedulerConfig },
): Promise<
  { ok: true; preview: RatingIntervalPreview } | { ok: false; reason: "scheduler-mismatch" }
> {
  if (!input.ownerId.trim()) throw new Error("Study preview requires a verified owner");
  const stored = await memory.getByItem({
    ownerId: input.ownerId,
    practiceItemId: input.practiceItemId,
  });
  if (stored && !schedulerCompatibility(stored, input.config).ok)
    return { ok: false, reason: "scheduler-mismatch" };
  const state = stored?.state ?? scheduler.createInitialState(input.now, input.config);
  const intervals = scheduler
    .preview(state, input.now, input.config)
    .map(({ rating, state: next }) => ({
      rating,
      intervalMs: Math.max(0, next.dueAt.getTime() - input.now.getTime()),
    }));
  return {
    ok: true,
    preview: {
      calculatedAt: input.now.toISOString(),
      fuzzEnabled: input.config.enableFuzz,
      revision: stored?.revision ?? null,
      intervals,
    },
  };
}
