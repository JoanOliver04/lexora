import {
  practiceItemPromptFrom,
  type PracticeItemContent,
  type PracticeItemPromptContent,
} from "@/modules/library/application/practice-item-content";
import type { DailyQueueRepository } from "./daily-queue";
import { getStudySession, type StudySessionRepository } from "./study-session";

export interface StudyCardRepository {
  findContent(input: {
    ownerId: string;
    courseId: string;
    practiceItemId: string;
  }): Promise<StudyCardContent | null>;
}

export type StudyCardContent = PracticeItemContent & {
  exampleText: string | null;
  explanationText: string | null;
};
export { REVIEW_RATINGS, type ReviewRating } from "@/modules/study/domain/memory";

export interface StudyCard {
  practiceItemId: string;
  prompt: PracticeItemPromptContent;
}

/** Authorize the session, follow its live queue, and expose only the first front. */
export async function getStudySessionCard(
  sessions: StudySessionRepository,
  queue: DailyQueueRepository,
  cards: StudyCardRepository,
  input: { ownerId: string; sessionId: unknown; now: Date; timeZone: string },
) {
  const result = await getStudySession(sessions, queue, input);
  if (!result.ok) return result;
  const first = result.queue?.entries[0];
  let card: StudyCard | null = null;
  if (first) {
    const content = await cards.findContent({
      ownerId: input.ownerId,
      courseId: result.session.courseId,
      practiceItemId: first.practiceItemId,
    });
    if (content)
      card = { practiceItemId: first.practiceItemId, prompt: practiceItemPromptFrom(content) };
  }
  return { ...result, card };
}

export type RevealStudyCardResult =
  | { ok: true; practiceItemId: string; content: StudyCardContent }
  | { ok: false; reason: "not-found" | "invalid-timezone" | "card-changed" };

/** Read-only reveal: never disclose an arbitrary ID or substitute another front. */
export async function revealStudySessionCard(
  sessions: StudySessionRepository,
  queue: DailyQueueRepository,
  cards: StudyCardRepository,
  input: {
    ownerId: string;
    sessionId: unknown;
    practiceItemId: unknown;
    now: Date;
    timeZone: string;
  },
): Promise<RevealStudyCardResult> {
  const result = await getStudySession(sessions, queue, input);
  if (!result.ok) return result;
  const first = result.queue?.entries[0];
  if (!first || first.practiceItemId !== input.practiceItemId)
    return { ok: false, reason: "card-changed" };
  const content = await cards.findContent({
    ownerId: input.ownerId,
    courseId: result.session.courseId,
    practiceItemId: first.practiceItemId,
  });
  if (!content) return { ok: false, reason: "card-changed" };
  return { ok: true, practiceItemId: first.practiceItemId, content };
}
