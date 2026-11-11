import { describe, expect, it } from "vitest";
import { nextSessionStatus, SESSION_ACTIONS, type StudySessionStatus } from "./study-session";

describe("session lifecycle", () => {
  const outcomes: Record<StudySessionStatus, (StudySessionStatus | null)[]> = {
    active: ["paused", "active", "completed", "abandoned"],
    paused: ["paused", "active", null, "abandoned"],
    completed: [null, null, "completed", null],
    abandoned: [null, null, null, "abandoned"],
  };
  for (const status of Object.keys(outcomes) as StudySessionStatus[])
    it.each(SESSION_ACTIONS)(`${status}: %s`, (action) => {
      expect(nextSessionStatus(status, action)).toBe(
        outcomes[status][SESSION_ACTIONS.indexOf(action)],
      );
    });
});
