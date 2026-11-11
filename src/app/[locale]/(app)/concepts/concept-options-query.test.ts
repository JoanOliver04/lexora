import { describe, it, expect } from "vitest";
import { conceptOptionsReturnPath } from "./concept-options-query";
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
});
