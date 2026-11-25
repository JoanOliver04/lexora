import { describe, it, expect } from "vitest";
import { conceptListReturnPath, conceptOptionsReturnPath } from "./concept-options-query";
const id = "10000000-0000-4000-8000-000000000001";
describe("concept option return paths", () => {
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
    expect(conceptListReturnPath("es", nested)).toBe(`/es/concepts?${query}`);
    expect(conceptOptionsReturnPath("en", id, query.toString(), "item")).toBe(
      `/en/concepts/${id}?${query}`,
    );
  });
  it("builds a local list destination only from supported filters", () => {
    const raw =
      "q=rock%26roll&kind=bad&cefrLevel=bad&page=1&archived=1&archived=1&next=https://example.com";
    expect(conceptListReturnPath("en", raw)).toBe("/en/concepts?q=rock%26roll");
    expect(conceptListReturnPath("other", null)).toBe("/es/concepts");
  });
});
