import { describe, expect, it } from "vitest";

import { isDifficultItem } from "./difficult-item";

describe("isDifficultItem", () => {
  it("uses the lifetime lapse threshold independently of recent ratings", () => {
    expect(isDifficultItem(3, [])).toBe(true);
    expect(isDifficultItem(8, ["good", "easy", "hard"])).toBe(true);
    expect(isDifficultItem(2, ["good", "easy", "hard"])).toBe(false);
  });

  it("needs two Again ratings in the three newest attempts", () => {
    expect(isDifficultItem(0, ["again", "good", "again"])).toBe(true);
    expect(isDifficultItem(0, ["again", "again"])).toBe(true);
    expect(isDifficultItem(0, ["again"])).toBe(false);
    expect(isDifficultItem(0, ["hard", "hard", "hard"])).toBe(false);
    expect(isDifficultItem(0, ["good", "good", "again", "again"])).toBe(false);
  });
});
