import { z } from "zod";

import {
  equalStudyScopes,
  studyScopeFromSelection,
  studyScopeFromQuery,
  type StudyScope,
} from "@/modules/study/domain/study-scope";
import type { StudySession } from "@/modules/study/domain/study-session";
import { getDailyQueue, type DailyQueueRepository, type DailyQueue } from "./daily-queue";
import { StudyError } from "./study-error";
import type { DashboardDeck, TodayDashboardRepository } from "./today-dashboard";

export type { StudyScope, StudySession };
export interface StudySessionRepository {
  get(input: { ownerId: string; sessionId: string }): Promise<StudySession | null>;
  create(input: {
    ownerId: string;
    sessionId: string;
    courseId: string;
    scope: StudyScope;
    startedAt: Date;
  }): Promise<StudySession>;
}

interface StudyInput {
  ownerId: string;
  courseId: string;
  now: Date;
  timeZone: string;
}
export interface StudySetup {
  decks: DashboardDeck[];
  scope: StudyScope;
  courseQueue: DailyQueue;
}
export type CreateStudySessionReason =
  | "invalid-scope"
  | "invalid-session-id"
  | "not-found"
  | "invalid-timezone"
  | "no-items"
  | "session-conflict";
export type CreateStudySessionResult =
  | { ok: true; session: StudySession; replayed: boolean }
  | { ok: false; reason: CreateStudySessionReason };

const sessionIdSchema = z.string().uuid();
export function parseStudySessionId(raw: unknown): string | null {
  const parsed = sessionIdSchema.safeParse(raw);
  return parsed.success ? parsed.data.toLowerCase() : null;
}
function assertOwner(ownerId: string): void {
  if (!ownerId.trim())
    throw new Error("caso de uso de estudio invocado sin identificador de usuario");
}
function scopeBelongsToDecks(scope: StudyScope, decks: DashboardDeck[]): boolean {
  const ids = new Set(decks.map((deck) => deck.id));
  return scope.deckIds === null || scope.deckIds.every((id) => ids.has(id));
}

export async function getStudySetup(
  queue: DailyQueueRepository,
  decks: Pick<TodayDashboardRepository, "listActiveDecks">,
  input: StudyInput & { deckQuery?: unknown },
): Promise<
  | { ok: true; setup: StudySetup }
  | { ok: false; reason: "invalid-scope" | "not-found" | "invalid-timezone" }
> {
  assertOwner(input.ownerId);
  const scope = studyScopeFromQuery(input.deckQuery);
  if (!scope) return { ok: false, reason: "invalid-scope" };
  const activeDecks = await decks.listActiveDecks({
    ownerId: input.ownerId,
    courseId: input.courseId,
  });
  if (!scopeBelongsToDecks(scope, activeDecks)) return { ok: false, reason: "invalid-scope" };
  const result = await getDailyQueue(queue, {
    ownerId: input.ownerId,
    courseId: input.courseId,
    now: input.now,
    timeZone: input.timeZone,
    deckIds: null,
  });
  if (!result.ok) return result;
  return { ok: true, setup: { decks: activeDecks, scope, courseQueue: result.queue } };
}

export async function createStudySession(
  sessions: StudySessionRepository,
  queue: DailyQueueRepository,
  decks: Pick<TodayDashboardRepository, "listActiveDecks">,
  input: StudyInput & { sessionId: unknown; mode: unknown; deckIds: unknown },
): Promise<CreateStudySessionResult> {
  assertOwner(input.ownerId);
  const sessionId = parseStudySessionId(input.sessionId);
  if (!sessionId) return { ok: false, reason: "invalid-session-id" };
  const scope = studyScopeFromSelection(input.mode, input.deckIds);
  if (!scope) return { ok: false, reason: "invalid-scope" };
  const replay = (session: StudySession): CreateStudySessionResult =>
    session.courseId === input.courseId && equalStudyScopes(session.scope, scope)
      ? { ok: true, session, replayed: true }
      : { ok: false, reason: "session-conflict" };
  const existing = await sessions.get({ ownerId: input.ownerId, sessionId });
  if (existing) return replay(existing);
  const activeDecks = await decks.listActiveDecks({
    ownerId: input.ownerId,
    courseId: input.courseId,
  });
  if (!scopeBelongsToDecks(scope, activeDecks)) return { ok: false, reason: "invalid-scope" };
  const result = await getDailyQueue(queue, {
    ownerId: input.ownerId,
    courseId: input.courseId,
    deckIds: scope.deckIds,
    now: input.now,
    timeZone: input.timeZone,
  });
  if (!result.ok) return result;
  if (result.queue.entries.length === 0) return { ok: false, reason: "no-items" };
  try {
    const session = await sessions.create({
      ownerId: input.ownerId,
      sessionId,
      courseId: input.courseId,
      scope,
      startedAt: input.now,
    });
    return { ok: true, session, replayed: false };
  } catch (error) {
    if (!(error instanceof StudyError) || error.kind !== "duplicate") throw error;
    // A retry or concurrent submit may have inserted the same primary key.
    const winner = await sessions.get({ ownerId: input.ownerId, sessionId });
    return winner ? replay(winner) : { ok: false, reason: "not-found" };
  }
}

export async function getStudySession(
  sessions: StudySessionRepository,
  queue: DailyQueueRepository,
  input: { ownerId: string; sessionId: unknown; now: Date; timeZone: string },
): Promise<
  | { ok: true; session: StudySession; queue: DailyQueue | null }
  | { ok: false; reason: "not-found" | "invalid-timezone" }
> {
  assertOwner(input.ownerId);
  const sessionId = parseStudySessionId(input.sessionId);
  if (!sessionId) return { ok: false, reason: "not-found" };
  const session = await sessions.get({ ownerId: input.ownerId, sessionId });
  if (!session) return { ok: false, reason: "not-found" };
  if (session.status !== "active") return { ok: true, session, queue: null };
  const result = await getDailyQueue(queue, {
    ownerId: input.ownerId,
    courseId: session.courseId,
    deckIds: session.scope.deckIds,
    now: input.now,
    timeZone: input.timeZone,
  });
  return result.ok ? { ok: true, session, queue: result.queue } : result;
}
