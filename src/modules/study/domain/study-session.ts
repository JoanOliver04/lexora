import type { StudyScope } from "./study-scope";

export type StudySessionStatus = "active" | "paused" | "completed" | "abandoned";
export const SESSION_ACTIONS = ["pause", "resume", "complete", "abandon"] as const;
export type StudySessionAction = (typeof SESSION_ACTIONS)[number];

/** Terminal sessions never reopen; a read or tab close is not a transition. */
export function nextSessionStatus(
  status: StudySessionStatus,
  action: StudySessionAction,
): StudySessionStatus | null {
  const transitions: Record<
    StudySessionStatus,
    Partial<Record<StudySessionAction, StudySessionStatus>>
  > = {
    active: { pause: "paused", resume: "active", complete: "completed", abandon: "abandoned" },
    paused: { pause: "paused", resume: "active", abandon: "abandoned" },
    completed: { complete: "completed" },
    abandoned: { abandon: "abandoned" },
  };
  return transitions[status][action] ?? null;
}

/** The scope is reproducible; the current queue is deliberately not persisted. */
export interface StudySession {
  id: string;
  ownerId: string;
  courseId: string;
  scope: StudyScope;
  status: StudySessionStatus;
  startedAt: Date;
  endedAt: Date | null;
}
