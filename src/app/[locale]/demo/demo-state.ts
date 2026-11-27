import { z } from "zod";
import { answerMatches } from "@/modules/library/domain/eoi";
import { REVIEW_RATINGS, type ReviewRating } from "@/modules/study/domain/memory";

export const DEMO_KEY = "lexora.demo.brighton.v1";
export const VOCABULARY = "a return ticket";
export const TRANSCRIPT = "The next train to Brighton leaves from platform four at half past nine.";
export const PLATFORMS = ["Platform 2", "Platform 4", "Platform 9"] as const;
export const CORRECT_PLATFORM = "Platform 4";

export type ReviewInterval = { rating: ReviewRating; minutes: number };

const stateSchema = z.object({
  stage: z.literal([0, 1, 2, 3]),
  revealed: z.boolean(),
  review: z
    .object({ rating: z.enum(REVIEW_RATINGS), minutes: z.number().int().positive() })
    .nullable(),
  draft: z.string().max(120),
  grammarChecked: z.boolean(),
  platform: z.enum(PLATFORMS).nullable(),
  listeningChecked: z.boolean(),
});

export type DemoState = z.infer<typeof stateSchema>;

export const INITIAL_DEMO: DemoState = {
  stage: 0,
  revealed: false,
  review: null,
  draft: "",
  grammarChecked: false,
  platform: null,
  listeningChecked: false,
};

export function grammarMatches(draft: string) {
  return answerMatches(draft.replaceAll("’", "'"), "has not arrived", ["hasn't arrived"]);
}

export function restoreDemo(raw: string | null): DemoState {
  if (!raw) return INITIAL_DEMO;
  try {
    const value = stateSchema.parse(JSON.parse(raw));
    if (value.stage === 0 && (value.review || value.draft || value.grammarChecked))
      return INITIAL_DEMO;
    if (value.stage > 0 && (!value.revealed || !value.review)) return INITIAL_DEMO;
    if (value.grammarChecked && !value.draft.trim()) return INITIAL_DEMO;
    if (value.stage < 2 && (value.platform || value.listeningChecked)) return INITIAL_DEMO;
    if (value.stage > 1 && !value.grammarChecked) return INITIAL_DEMO;
    if (value.listeningChecked && !value.platform) return INITIAL_DEMO;
    if (value.stage === 3 && !value.listeningChecked) return INITIAL_DEMO;
    return value;
  } catch {
    return INITIAL_DEMO;
  }
}

/** One store per mounted demo. Storage may be disabled by the browser. */
export function createDemoStore() {
  let state: DemoState | undefined;
  const listeners = new Set<() => void>();
  const getSnapshot = () => {
    if (state) return state;
    try {
      state = restoreDemo(window.sessionStorage.getItem(DEMO_KEY));
    } catch {
      state = INITIAL_DEMO;
    }
    return state;
  };
  function persist(next: DemoState) {
    state = next;
    try {
      if (next === INITIAL_DEMO) window.sessionStorage.removeItem(DEMO_KEY);
      else window.sessionStorage.setItem(DEMO_KEY, JSON.stringify(next));
    } catch {
      // The in-memory journey remains usable if session storage is unavailable.
    }
    for (const notify of listeners) notify();
  }
  return {
    getSnapshot,
    getServerSnapshot: () => INITIAL_DEMO,
    subscribe(notify: () => void) {
      listeners.add(notify);
      return () => {
        listeners.delete(notify);
      };
    },
    update(patch: Partial<DemoState>) {
      persist({ ...getSnapshot(), ...patch });
    },
    restart() {
      persist(INITIAL_DEMO);
    },
  };
}
