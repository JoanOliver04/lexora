/**
 * Confirma un repaso: calcula (LEX-5.8) y escribe atómicamente (LEX-5.9).
 *
 * El cliente sigue enviando solo intención. El committer es un puerto;
 * la RPC `commit_review` (ADR-006) es el adaptador.
 *
 * LEX-5.10: un reintento con la misma clave (doble clic, respuesta
 * perdida) reexpide el resultado original. Se consulta la clave **antes**
 * de calcular: si ya hay log, no se llama al planificador ni se vuelve a
 * escribir. `reviewPracticeItem` solo vería `revision-conflict`.
 *
 * LEX-5.11: si otro dispositivo confirmó antes, el conflicto incluye el
 * estado actual para que la interfaz recargue. No se sobrescribe.
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

export interface ReplayLookup {
  practiceItemId: string;
  rating: ReviewRating;
  reviewedAt: Date;
}

export interface ReviewCommitter {
  findByIdempotencyKey(input: {
    ownerId: string;
    idempotencyKey: string;
  }): Promise<ReplayLookup | null>;
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
  | { ok: false; reason: "revision-conflict"; current: StoredLearningState }
  | {
      ok: false;
      reason:
        | Exclude<ReviewPracticeItemReason, "revision-conflict">
        | Exclude<CommitReviewReason, "revision-conflict">
        | "invalid-idempotency-key";
    };

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de estudio invocado sin identificador de usuario");
  }
}

export function isIdempotencyKey(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= 128;
}

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
  assertUserId(input.ownerId);

  if (!isIdempotencyKey(input.idempotencyKey)) {
    return { ok: false, reason: "invalid-idempotency-key" };
  }

  const existing = await committer.findByIdempotencyKey({
    ownerId: input.ownerId,
    idempotencyKey: input.idempotencyKey,
  });
  if (existing) {
    const stored = await repository.getByItem({
      ownerId: input.ownerId,
      practiceItemId: existing.practiceItemId,
    });
    if (!stored) {
      return { ok: false, reason: "not-found" };
    }
    const preview = scheduler.preview(stored.state, input.now, input.config);
    return {
      ok: true,
      stored,
      replayed: true,
      rating: existing.rating,
      transition: {
        state: stored.state,
        rating: existing.rating,
        reviewedAt: existing.reviewedAt,
      },
      preview,
    };
  }

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
  if (!committed.ok) {
    if (committed.reason === "not-found") {
      return { ok: false, reason: "not-found" };
    }
    const current = await repository.getByItem({
      ownerId: input.ownerId,
      practiceItemId: input.practiceItemId,
    });
    if (!current) {
      return { ok: false, reason: "not-found" };
    }
    return { ok: false, reason: "revision-conflict", current };
  }

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
