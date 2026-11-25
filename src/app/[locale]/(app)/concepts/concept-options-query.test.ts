import { describe, it, expect } from "vitest";
import {
  conceptParentReturnPath,
  conceptOptionsReturnPath,
  practiceItemOrigin,
} from "./concept-options-query";
const id = "10000000-0000-4000-8000-000000000001";
describe("concept option return paths", () => {
  it("accepts only a single session ID when returning from a card editor", () => {
    expect(practiceItemOrigin(id, { fromStudy: id, itemPage: "4" })).toEqual({
      sessionId: id,
      href: `/app/study/${id}`,
      returnQuery: `fromStudy=${id}`,
    });
    for (const fromStudy of ["//elsewhere.example", [id, id]]) {
      expect(practiceItemOrigin(id, { fromStudy, itemPage: "2" })).toEqual({
        sessionId: null,
        href: `/concepts/${id}?itemPage=2`,
        returnQuery: "itemPage=2",
      });
    }
  });
  it("preserves numeric pages and ignores arbitrary destinations or repeated parameters", () => {
    expect(
      conceptOptionsReturnPath("en", id, "tagPage=51&itemPage=3&next=https://example.com"),
    ).toBe(`/en/concepts/${id}?tagPage=51&itemPage=3`);
    expect(conceptOptionsReturnPath("es", id, "tagPage=2&tagPage=3&itemPage=NaN")).toBe(
      `/es/concepts/${id}`,
    );
    expect(conceptOptionsReturnPath("en", "invalid", "tagPage=2")).toBe("/en/concepts");
  });
  it("keeps the simple route for small lists and selects the newest item page for long lists", () => {
    expect(conceptOptionsReturnPath("en", id, "", "tag")).toBe(`/en/concepts/${id}`);
    expect(conceptOptionsReturnPath("en", id, "tagPage=51&itemPage=1", "item")).toBe(
      `/en/concepts/${id}?tagPage=51&saved=item&itemPage=1000000`,
    );
  });
  it("round trips a filtered list without mixing in the card or tag page", () => {
    const query = new URLSearchParams({
      q: "漢".repeat(200),
      kind: "grammar",
      cefrLevel: "B2",
      archived: "1",
      page: "3",
    });
    const nested = `${query}&tagPage=4&itemPage=2&saved=tag`;
    expect(conceptOptionsReturnPath("es", id, nested)).toBe(
      `/es/concepts/${id}?${query}&tagPage=4&itemPage=2`,
    );
    expect(conceptParentReturnPath("es", nested)).toBe(`/es/concepts?${query}`);
    expect(conceptOptionsReturnPath("en", id, query.toString(), "item")).toBe(
      `/en/concepts/${id}?${query}`,
    );
  });
  it("builds a local list destination only from supported filters", () => {
    const raw =
      "q=rock%26roll&kind=bad&cefrLevel=bad&page=1&archived=1&archived=1&next=https://example.com";
    expect(conceptParentReturnPath("en", raw)).toBe("/en/concepts?q=rock%26roll");
    expect(conceptParentReturnPath("other", null)).toBe("/es/concepts");
  });
  it("round trips the source deck and all three Unicode searches through a card", () => {
    const term = "漢".repeat(200);
    const filters = new URLSearchParams({
      q: term,
      category: "grammar",
      cefrLevel: "B2",
      archived: "1",
      page: "3",
      members: term,
      available: term,
      memberPage: "2",
      availablePage: "4",
    });
    const nested = `${filters}&fromDeck=${id}&tagPage=2&itemPage=3`;
    expect(conceptOptionsReturnPath("en", id, nested)).toBe(`/en/concepts/${id}?${nested}`);
    expect(conceptParentReturnPath("en", nested)).toBe(`/en/decks/${id}?${filters}#deck-concepts`);
  });
  it("uses only a single valid deck ID as the origin", () => {
    for (const fromDeck of ["//elsewhere", `${id}&fromDeck=${id}`]) {
      expect(conceptParentReturnPath("es", `fromDeck=${fromDeck}&memberPage=3`)).toBe(
        "/es/concepts",
      );
    }
  });
});
