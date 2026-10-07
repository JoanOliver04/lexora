import { describe, expect, it } from "vitest";
import {
  studyScopeFromQuery,
  studyScopeFromSnapshot,
  studyScopeFromSelection,
  equalStudyScopes,
} from "./study-scope";

const DECK = "d0000000-0000-4000-8000-000000000001";

describe("study scope", () => {
  it("requires an explicit nonempty subset or all decks for session creation", () => {
    expect(studyScopeFromSelection("all", [])).toEqual({ deckIds: null });
    expect(studyScopeFromSelection("selected", [DECK])).toEqual({ deckIds: [DECK] });
    expect(studyScopeFromSelection("selected", [])).toBeNull();
    expect(studyScopeFromSelection("selected", null)).toBeNull();
    expect(studyScopeFromSelection("unknown", [DECK])).toBeNull();
  });
  it("compares selected scopes as sets while retaining all/none distinction", () => {
    const other = "d0000000-0000-4000-8000-000000000002";
    expect(equalStudyScopes({ deckIds: [DECK, other] }, { deckIds: [other, DECK] })).toBe(true);
    expect(equalStudyScopes({ deckIds: null }, { deckIds: [] })).toBe(false);
  });
  it("distinguishes all decks from an empty selection", () => {
    expect(studyScopeFromSnapshot({})).toEqual({ deckIds: null });
    expect(studyScopeFromSnapshot({ deckIds: null })).toEqual({ deckIds: null });
    expect(studyScopeFromSnapshot({ deckIds: [] })).toEqual({ deckIds: [] });
    expect(studyScopeFromQuery(undefined)).toEqual({ deckIds: null });
  });
  it("normalizes and deduplicates valid query identifiers", () => {
    expect(studyScopeFromQuery(DECK.toUpperCase())).toEqual({ deckIds: [DECK] });
    expect(studyScopeFromQuery([DECK, DECK])).toEqual({ deckIds: [DECK] });
  });
  it("rejects malformed or excessive selections", () => {
    for (const raw of [
      null,
      [],
      "not-a-snapshot",
      { deckIds: "not-an-array" },
      { deckIds: [1] },
      { deckIds: ["invalid"] },
      { deckIds: Array(101).fill(DECK) },
    ])
      expect(studyScopeFromSnapshot(raw)).toBeNull();
    expect(studyScopeFromQuery("invalid")).toBeNull();
  });
});
