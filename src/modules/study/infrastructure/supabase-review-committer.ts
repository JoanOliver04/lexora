import type { SupabaseClient } from "@supabase/supabase-js";

import {
  learningStateSnapshot,
  type CommitReviewReason,
  type CommitReviewResult,
  type ReviewCommitter,
} from "@/modules/study/application/confirm-review";
import { studyErrorFrom, StudyError } from "@/modules/study/application/study-error";
import type { Database, Json } from "@/shared/infrastructure/supabase/database.types";

/**
 * Adaptador de `ReviewCommitter` sobre `public.commit_review` (ADR-006).
 *
 * Una sola RPC: el SQL actualiza `learning_states` y añade el `review_logs`
 * en la misma transacción. SECURITY INVOKER: `auth.uid()` es el dueño; el
 * `ownerId` del puerto no viaja a la base (igual que el onboarding).
 *
 * Los números FSRS los calcula `reviewPracticeItem` (LEX-5.8). Esta
 * función no los recalcula.
 */
export function createSupabaseReviewCommitter(client: SupabaseClient<Database>): ReviewCommitter {
  return {
    async commit(input) {
      const { data, error } = await client.rpc("commit_review", {
        p_practice_item_id: input.practiceItemId,
        p_expected_revision: input.expectedRevision,
        p_idempotency_key: input.idempotencyKey,
        p_rating: input.rating,
        p_reviewed_at: input.reviewedAt.toISOString(),
        p_due_at: input.next.dueAt.toISOString(),
        p_stability: input.next.stability,
        p_difficulty: input.next.difficulty,
        p_scheduled_days: input.next.scheduledDays,
        p_learning_step: input.next.learningStep,
        p_reps: input.next.reps,
        p_lapses: input.next.lapses,
        p_phase: input.next.phase,
        p_last_reviewed_at: (input.next.lastReviewedAt ?? input.reviewedAt).toISOString(),
        p_scheduler_version: input.schedulerVersion,
        p_config_version: input.configVersion,
        p_state_before: learningStateSnapshot(input.previous) as Json,
        p_state_after: learningStateSnapshot(input.next) as Json,
        p_due_before: input.previous.dueAt.toISOString(),
        p_due_after: input.next.dueAt.toISOString(),
        ...(input.studySessionId ? { p_study_session_id: input.studySessionId } : {}),
        ...(input.durationMs != null ? { p_duration_ms: input.durationMs } : {}),
      });

      if (error) {
        throw studyErrorFrom(error, "no se pudo confirmar el repaso");
      }

      return parseCommitReviewPayload(data);
    },
  };
}

function parseCommitReviewPayload(data: unknown): CommitReviewResult {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new StudyError("unavailable", "commit_review no devolvió un objeto");
  }

  const payload = data as {
    ok?: unknown;
    replayed?: unknown;
    reason?: unknown;
  };

  if (payload.ok === true) {
    return { ok: true, replayed: payload.replayed === true };
  }

  if (payload.ok === false) {
    const reason = payload.reason;
    if (isCommitReviewReason(reason)) {
      return { ok: false, reason };
    }
    throw new StudyError(
      "unavailable",
      `commit_review rechazó el repaso (razón ${String(reason ?? "desconocida")})`,
    );
  }

  throw new StudyError("unavailable", "commit_review no devolvió un resultado reconocible");
}

function isCommitReviewReason(value: unknown): value is CommitReviewReason {
  return value === "not-found" || value === "revision-conflict";
}
