import {
  summarizeSessionReviews,
  type SessionReviewRecord,
  type SessionReviewTotals,
} from "@/modules/study/domain/session-summary";
import { getDailyQueue, type DailyQueueRepository } from "./daily-queue";
import { parseStudySessionId, type StudySessionRepository } from "./study-session";

export interface SessionHistoryRepository {
  listReviews(input: {
    ownerId: string;
    sessionId: string;
    now: Date;
  }): Promise<SessionReviewRecord[]>;
}

export interface SessionSummary extends SessionReviewTotals {
  /** Recomputed from the saved scope, not a frozen counter or the original queue size. */
  remaining: {
    availableCount: number;
    hiddenDueReviews: number;
    hiddenNew: number;
    hasFutureReviews: boolean;
  } | null;
}

export async function getStudySessionSummary(
  sessions: StudySessionRepository,
  history: SessionHistoryRepository,
  queue: DailyQueueRepository,
  input: { ownerId: string; sessionId: unknown; now: Date; timeZone: string },
): Promise<
  { ok: true; summary: SessionSummary } | { ok: false; reason: "not-found" | "active-session" }
> {
  if (!input.ownerId.trim()) throw new Error("Session summary requires a verified owner");
  const sessionId = parseStudySessionId(input.sessionId);
  if (!sessionId) return { ok: false, reason: "not-found" };
  const session = await sessions.get({ ownerId: input.ownerId, sessionId });
  if (!session || session.ownerId !== input.ownerId) return { ok: false, reason: "not-found" };
  if (session.status === "active") return { ok: false, reason: "active-session" };
  const [records, current] = await Promise.all([
    history.listReviews({ ownerId: input.ownerId, sessionId, now: input.now }),
    getDailyQueue(queue, {
      ownerId: input.ownerId,
      courseId: session.courseId,
      deckIds: session.scope.deckIds,
      now: input.now,
      timeZone: input.timeZone,
    }),
  ]);
  return {
    ok: true,
    summary: {
      ...summarizeSessionReviews(records),
      remaining: current.ok
        ? {
            availableCount: current.queue.entries.length,
            hiddenDueReviews: current.queue.hiddenDueReviews,
            hiddenNew: current.queue.hiddenNew,
            hasFutureReviews: current.queue.nextDueAt !== null,
          }
        : null,
    },
  };
}
