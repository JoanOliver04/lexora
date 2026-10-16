import { z } from "zod";

import {
  equalStudyScopes,
  studyScopeFromSelection,
  studyScopeFromQuery,
  type StudyScope,
} from "@/modules/study/domain/study-scope";
import type { StudySession } from "@/modules/study/domain/study-session";
import { SESSION_ACTIONS, nextSessionStatus } from "@/modules/study/domain/study-session";
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
  listOpen(input: { ownerId: string; courseId: string }): Promise<StudySession[]>;
  transition(input: {
    ownerId: string;
    sessionId: string;
    expectedStatus: StudySession["status"];
    status: StudySession["status"];
    endedAt: Date | null;
  }): Promise<StudySession | null>;
}

export type ChangeSessionReason =
  | "invalid-input"
  | "not-found"
  | "invalid-transition"
  | "session-changed"
  | "items-available"
  | "invalid-timezone";
export type ChangeSessionResult =
  { ok: true; session: StudySession } | { ok: false; reason: ChangeSessionReason };

/** Compare-and-set, with no writes to memory, logs or the saved scope. */
export async function changeStudySession(
  sessions: StudySessionRepository,
  queue: DailyQueueRepository,
  input: {
    ownerId: string;
    sessionId: unknown;
    action: unknown;
    expectedStatus: unknown;
    now: Date;
    timeZone: string;
  },
): Promise<ChangeSessionResult> {
  assertOwner(input.ownerId);
  const sessionId = parseStudySessionId(input.sessionId);
  const action = z.enum(SESSION_ACTIONS).safeParse(input.action);
  if (
    !sessionId ||
    !action.success ||
    !["active", "paused", "completed", "abandoned"].includes(String(input.expectedStatus))
  )
    return { ok: false, reason: "invalid-input" };
  const session = await sessions.get({ ownerId: input.ownerId, sessionId });
  if (!session || session.ownerId !== input.ownerId) return { ok: false, reason: "not-found" };
  const status = nextSessionStatus(session.status, action.data);
  if (!status) return { ok: false, reason: "invalid-transition" };
  // A lost response may be retried, but never resurrect a terminal session.
  if (status === session.status) return { ok: true, session };
  if (session.status !== input.expectedStatus) return { ok: false, reason: "session-changed" };
  if (action.data === "complete" || action.data === "resume") {
    const current = await getDailyQueue(queue, {
      ownerId: input.ownerId,
      courseId: session.courseId,
      deckIds: session.scope.deckIds,
      now: input.now,
      timeZone: input.timeZone,
    });
    if (!current.ok) return current;
    if (action.data === "complete" && current.queue.entries.length > 0)
      return { ok: false, reason: "items-available" };
  }
  const changed = await sessions.transition({
    ownerId: input.ownerId,
    sessionId,
    expectedStatus: session.status,
    status,
    endedAt:
      status === "completed" || status === "abandoned"
        ? new Date(Math.max(input.now.getTime(), session.startedAt.getTime()))
        : null,
  });
  return changed ? { ok: true, session: changed } : { ok: false, reason: "session-changed" };
}

export async function listOpenStudySessions(
  sessions: StudySessionRepository,
  input: { ownerId: string; courseId: string },
): Promise<StudySession[]> {
  assertOwner(input.ownerId);
  return sessions.listOpen(input);
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
