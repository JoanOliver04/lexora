/**
 * Caso de uso `ReviewPracticeItem` (LEX-5.8).
 *
 * La presentación envía solo intención: ítem, valoración, `revision`
 * esperada. El servidor deriva el dueño, el reloj y el estado, llama al
 * adaptador y produce la transición. **No escribe.** El commit atómico
 * (estado + log) es LEX-5.9.
 *
 * No crea un `LearningState`: un New de la cola sin fila debe pasar
 * antes por `ensureLearningState` (LEX-5.6). No se valora un ítem
 * archivado.
 */

import {
  isReviewRating,
  type ReviewRating,
  type RatingPreview,
  type ReviewTransition,
} from "@/modules/study/domain/memory";
import type { VersionedSchedulerConfig } from "@/modules/study/domain/scheduler-config";
import type { LearningStateRepository, StoredLearningState } from "./learning-state";
import type { SpacedRepetitionScheduler } from "./spaced-repetition-scheduler";

export type ReviewPracticeItemReason =
  "not-found" | "archived" | "no-state" | "revision-conflict" | "invalid-rating";

export type ReviewPracticeItemResult =
  | {
      ok: true;
      current: StoredLearningState;
      transition: ReviewTransition;
      preview: RatingPreview[];
      rating: ReviewRating;
    }
  | { ok: false; reason: "revision-conflict"; current: StoredLearningState }
  | { ok: false; reason: Exclude<ReviewPracticeItemReason, "revision-conflict"> };

function assertUserId(userId: string): void {
  if (userId.trim() === "") {
    throw new Error("caso de uso de estudio invocado sin identificador de usuario");
  }
}

export async function reviewPracticeItem(
  repository: LearningStateRepository,
  scheduler: SpacedRepetitionScheduler,
  input: {
    ownerId: string;
    practiceItemId: string;
    rating: unknown;
    expectedRevision: number;
    now: Date;
    config: VersionedSchedulerConfig;
  },
): Promise<ReviewPracticeItemResult> {
  assertUserId(input.ownerId);

  if (!isReviewRating(input.rating)) {
    return { ok: false, reason: "invalid-rating" };
  }

  const item = await repository.findPracticeItem({
    ownerId: input.ownerId,
    practiceItemId: input.practiceItemId,
  });
  if (!item) {
    return { ok: false, reason: "not-found" };
  }
  if (item.archivedAt) {
    return { ok: false, reason: "archived" };
  }

  const current = await repository.getByItem({
    ownerId: input.ownerId,
    practiceItemId: input.practiceItemId,
  });
  if (!current) {
    return { ok: false, reason: "no-state" };
  }
  if (current.revision !== input.expectedRevision) {
    return { ok: false, reason: "revision-conflict", current };
  }

  const preview = scheduler.preview(current.state, input.now, input.config);
  const transition = scheduler.review(current.state, input.rating, input.now, input.config);

  return {
    ok: true,
    current,
    transition,
    preview,
    rating: input.rating,
  };
}
