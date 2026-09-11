/**
 * Confirma un repaso: calcula (LEX-5.8) y escribe atómicamente (LEX-5.9).
 *
 * El cliente sigue enviando solo intención. El committer es un puerto;
 * la RPC `commit_review` (ADR-006) es el adaptador.
 */

import type {
  LearningState,
  RatingPreview,
  ReviewRating,
  ReviewTransition,
} from "@/modules/study/domain/memory";
import type { VersionedSchedulerConfig } from "@/modules/study/domain/scheduler-config";
import type { LearningStateRepository, StoredLearningState } from "./learning-state";
import { reviewPracticeItem, type ReviewPracticeItemReason } from "./review-practice-item";
import type { SpacedRepetitionScheduler } from "./spaced-repetition-scheduler";

export type CommitReviewReason = "not-found" | "revision-conflict";

export type CommitReviewResult =
  { ok: true; replayed: boolean } | { ok: false; reason: CommitReviewReason };

export interface ReviewCommitter {
  commit(input: {
    ownerId: string;
    practiceItemId: string;
    expectedRevision: number;
    idempotencyKey: string;
    rating: ReviewRating;
    reviewedAt: Date;
    previous: LearningState;
    next: LearningState;
    schedulerVersion: string;
    configVersion: string;
    studySessionId: string | null;
    durationMs: number | null;
  }): Promise<CommitReviewResult>;
}

export function learningStateSnapshot(state: LearningState): Record<string, unknown> {
  return {
    phase: state.phase,
    dueAt: state.dueAt.toISOString(),
    lastReviewedAt: state.lastReviewedAt ? state.lastReviewedAt.toISOString() : null,
    stability: state.stability,
    difficulty: state.difficulty,
    scheduledDays: state.scheduledDays,
    learningStep: state.learningStep,
    reps: state.reps,
    lapses: state.lapses,
  };
}

export type ConfirmReviewResult =
  | {
      ok: true;
      stored: StoredLearningState;
      replayed: boolean;
      rating: ReviewRating;
      transition: ReviewTransition;
      preview: RatingPreview[];
    }
  | { ok: false; reason: ReviewPracticeItemReason | CommitReviewReason };

export async function confirmReview(
  repository: LearningStateRepository,
  scheduler: SpacedRepetitionScheduler,
  committer: ReviewCommitter,
  input: {
    ownerId: string;
    practiceItemId: string;
    rating: unknown;
    expectedRevision: number;
    idempotencyKey: string;
    now: Date;
    config: VersionedSchedulerConfig;
    studySessionId?: string | null;
    durationMs?: number | null;
  },
): Promise<ConfirmReviewResult> {
  const computed = await reviewPracticeItem(repository, scheduler, input);
  if (!computed.ok) return computed;

  const committed = await committer.commit({
    ownerId: input.ownerId,
    practiceItemId: input.practiceItemId,
    expectedRevision: input.expectedRevision,
    idempotencyKey: input.idempotencyKey,
    rating: computed.rating,
    reviewedAt: computed.transition.reviewedAt,
    previous: computed.current.state,
    next: computed.transition.state,
    schedulerVersion: input.config.schedulerPackageVersion,
    configVersion: input.config.configVersion,
    studySessionId: input.studySessionId ?? null,
    durationMs: input.durationMs ?? null,
  });
  if (!committed.ok) return committed;

  const stored = await repository.getByItem({
    ownerId: input.ownerId,
    practiceItemId: input.practiceItemId,
  });
  if (!stored) {
    return { ok: false, reason: "not-found" };
  }

  return {
    ok: true,
    stored,
    replayed: committed.replayed,
    rating: computed.rating,
    transition: computed.transition,
    preview: computed.preview,
  };
}
