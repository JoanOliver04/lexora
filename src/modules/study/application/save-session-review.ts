import { z } from "zod";

import type { VersionedSchedulerConfig } from "@/modules/study/domain/scheduler-config";
import { confirmReview, type ReplayLookup, type ReviewCommitter } from "./confirm-review";
import { getDailyQueue, type DailyQueueRepository } from "./daily-queue";
import { ensureLearningState, type LearningStateRepository } from "./learning-state";
import type { SpacedRepetitionScheduler } from "./spaced-repetition-scheduler";
import { REVIEW_RATINGS, type ReviewRating, type StudyCardRepository } from "./study-card";
import type { StudySessionRepository } from "./study-session";

const intentSchema = z.object({
  sessionId: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  practiceItemId: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  idempotencyKey: z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  rating: z.enum(REVIEW_RATINGS),
  expectedRevision: z.number().int().min(1).max(2_147_483_647).nullable(),
});

export type SaveSessionReviewReason =
  | "invalid-input"
  | "not-found"
  | "inactive-session"
  | "invalid-timezone"
  | "card-changed"
  | "idempotency-conflict"
  | "revision-conflict"
  | "scheduler-mismatch";

export type SaveSessionReviewResult =
  | { ok: true; rating: ReviewRating; replayed: boolean }
  | { ok: false; reason: SaveSessionReviewReason };

/** Authorize a live session intent, then reuse the existing atomic commit. */
export async function saveSessionReview(
  ports: {
    sessions: StudySessionRepository;
    queue: DailyQueueRepository;
    cards: StudyCardRepository;
    memory: LearningStateRepository;
    scheduler: SpacedRepetitionScheduler;
    committer: ReviewCommitter;
  },
  input: {
    ownerId: string;
    sessionId: unknown;
    practiceItemId: unknown;
    idempotencyKey: unknown;
    rating: unknown;
    expectedRevision: unknown;
    now: Date;
    timeZone: string;
    config: VersionedSchedulerConfig;
  },
): Promise<SaveSessionReviewResult> {
  if (!input.ownerId.trim()) throw new Error("Session review requires a verified owner");
  const parsed = intentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const intent = parsed.data;
  const session = await ports.sessions.get({
    ownerId: input.ownerId,
    sessionId: intent.sessionId,
  });
  if (!session || session.ownerId !== input.ownerId) return { ok: false, reason: "not-found" };
  if (session.status !== "active") return { ok: false, reason: "inactive-session" };

  const readReceipt = () =>
    ports.committer.findByIdempotencyKey({
      ownerId: input.ownerId,
      idempotencyKey: intent.idempotencyKey,
    });
  const receiptResult = (receipt: ReplayLookup): SaveSessionReviewResult =>
    receipt.practiceItemId === intent.practiceItemId &&
    receipt.studySessionId === session.id &&
    receipt.rating === intent.rating
      ? { ok: true, rating: receipt.rating, replayed: true }
      : { ok: false, reason: "idempotency-conflict" };
  const rejectOrReplay = async (
    reason: SaveSessionReviewReason,
  ): Promise<SaveSessionReviewResult> => {
    const raced = await readReceipt();
    return raced ? receiptResult(raced) : { ok: false, reason };
  };

  // A committed retry must work after its card has left the live queue.
  const existing = await readReceipt();
  if (existing) return receiptResult(existing);
  const available = await getDailyQueue(ports.queue, {
    ownerId: input.ownerId,
    courseId: session.courseId,
    deckIds: session.scope.deckIds,
    now: input.now,
    timeZone: input.timeZone,
  });
  if (!available.ok) return available;
  if (available.queue.entries[0]?.practiceItemId !== intent.practiceItemId)
    return rejectOrReplay("card-changed");
  const content = await ports.cards.findContent({
    ownerId: input.ownerId,
    courseId: session.courseId,
    practiceItemId: intent.practiceItemId,
  });
  if (!content) return rejectOrReplay("card-changed");

  if (intent.expectedRevision === null) {
    const ensured = await ensureLearningState(ports.memory, ports.scheduler, {
      ownerId: input.ownerId,
      practiceItemId: intent.practiceItemId,
      now: input.now,
      config: input.config,
    });
    if (!ensured.ok) return rejectOrReplay("card-changed");
  }
  const confirmed = await confirmReview(ports.memory, ports.scheduler, ports.committer, {
    ownerId: input.ownerId,
    practiceItemId: intent.practiceItemId,
    rating: intent.rating,
    // Newly created memory starts at revision 1; a raced review must conflict.
    expectedRevision: intent.expectedRevision ?? 1,
    idempotencyKey: intent.idempotencyKey,
    now: input.now,
    config: input.config,
    studySessionId: session.id,
  });
  if (!confirmed.ok)
    return rejectOrReplay(
      confirmed.reason === "revision-conflict" || confirmed.reason === "scheduler-mismatch"
        ? confirmed.reason
        : "card-changed",
    );
  if (confirmed.replayed) {
    // A concurrent request may have won the key after our first lookup.
    const receipt = await readReceipt();
    return receipt ? receiptResult(receipt) : { ok: false, reason: "idempotency-conflict" };
  }
  return { ok: true, rating: confirmed.rating, replayed: false };
}
