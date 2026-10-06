import type { StudyScope } from "./study-scope";

export type StudySessionStatus = "active" | "paused" | "completed" | "abandoned";

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
