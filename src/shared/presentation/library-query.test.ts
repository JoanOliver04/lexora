import { describe, expect, it } from "vitest";
import {
  collectionPage,
  collectionSearch,
  queryValue,
  withoutCollectionFilter,
} from "./library-query";

describe("library query boundaries", () => {
  it("takes the first repeated parameter and bounds search without interpreting markup", () => {
    expect(queryValue(["C1", "B2"])).toBe("C1");
    expect(queryValue([])).toBeUndefined();
    expect(collectionSearch(["  <b>literal</b>  ", "ignored"])).toBe("<b>literal</b>");
    expect(collectionSearch("x".repeat(201))).toHaveLength(200);
    expect(collectionSearch("   ")).toBeUndefined();
  });
  it("rejects partial, negative, non-decimal and unsafe page offsets", () => {
    for (const value of [
      undefined,
      "0",
      "-1",
      "2junk",
      "2.5",
      "2e3",
      "Infinity",
      "99999999999999999999",
      "450359962737050",
    ])
      expect(collectionPage(value), String(value)).toBe(1);
    expect(collectionPage(["3", "4"])).toBe(3);
    expect(collectionPage("23")).toBe(23);
  });
  it("removes only the selected filter, resets pagination and preserves archived scope", () => {
    const query = {
      q: "advanced",
      cefrLevel: "C1",
      category: "vocabulary",
      archived: "1",
      page: "3",
    };
    expect(withoutCollectionFilter(query, "cefrLevel")).toEqual({
      q: "advanced",
      category: "vocabulary",
      archived: "1",
    });
    expect(query.page).toBe("3");
  });
});
