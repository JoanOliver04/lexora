import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDemoStore,
  DEMO_KEY,
  grammarMatches,
  INITIAL_DEMO,
  restoreDemo,
  type DemoState,
} from "./demo-state";

const grammarStage: DemoState = {
  ...INITIAL_DEMO,
  stage: 1,
  revealed: true,
  review: { rating: "good", minutes: 10 },
};
const checkedGrammar: DemoState = {
  ...grammarStage,
  draft: "hasn't arrived",
  grammarChecked: true,
};
const finished: DemoState = {
  ...checkedGrammar,
  stage: 3,
  platform: "Platform 4",
  listeningChecked: true,
};

afterEach(() => vi.unstubAllGlobals());

describe("Brighton practice", () => {
  it.each(["hasn't arrived", "hasn’t arrived", "  HAS NOT   arrived "])("accepts %s", (draft) => {
    expect(grammarMatches(draft)).toBe(true);
  });

  it.each(["has arrived", "haven't arrived", "didn't arrive", ""])("rejects %s", (draft) => {
    expect(grammarMatches(draft)).toBe(false);
  });

  it("restores a draft, an unanswered listening choice and a finished journey", () => {
    for (const state of [
      { ...INITIAL_DEMO, revealed: true },
      { ...grammarStage, draft: "hasn" },
      { ...checkedGrammar, stage: 2, platform: "Platform 9" },
      finished,
    ]) {
      expect(restoreDemo(JSON.stringify(state))).toEqual(state);
    }
  });

  it("discards malformed storage and impossible progress", () => {
    for (const raw of [
      null,
      "{",
      "null",
      "{}",
      JSON.stringify({ ...INITIAL_DEMO, stage: 3 }),
      JSON.stringify({ ...grammarStage, review: { rating: "unknown", minutes: 1 } }),
      JSON.stringify({ ...finished, platform: "Platform 81" }),
      JSON.stringify({ ...finished, draft: " ", grammarChecked: true }),
    ]) {
      expect(restoreDemo(raw)).toBe(INITIAL_DEMO);
    }
  });

  it("resumes in a new instance and resets only this demo key", () => {
    const values = new Map([["lexora.unrelated", "keep"]]);
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
    const store = createDemoStore();
    const notify = vi.fn();
    const unsubscribe = store.subscribe(notify);
    store.update(grammarStage);
    store.update({ draft: "has" });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(createDemoStore().getSnapshot().draft).toBe("has");
    unsubscribe();
    store.restart();
    expect(store.getSnapshot()).toBe(INITIAL_DEMO);
    expect(values.has(DEMO_KEY)).toBe(false);
    expect(values.get("lexora.unrelated")).toBe("keep");
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("still supports the full journey when the browser denies storage", () => {
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw new Error("storage disabled");
      },
    });
    const store = createDemoStore();
    expect(store.getSnapshot()).toBe(INITIAL_DEMO);
    store.update(finished);
    expect(store.getSnapshot()).toEqual(finished);
    store.restart();
    expect(store.getSnapshot()).toBe(INITIAL_DEMO);
  });
});
