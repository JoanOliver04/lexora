import { expect, it } from "vitest";
import { formatRecordedStudyTime } from "./recorded-study-time";

it.each([
  [0, 0, "—"],
  [0, 1, "0 s"],
  [950, 1, "<1 s"],
  [20_000 + 20_000, 2, "40 s"],
  [35_000 + 35_000, 2, "1,2 min"],
] as const)("formats a total of %i ms with %i measurements", (duration, measured, result) => {
  expect(formatRecordedStudyTime("es", duration, measured)).toBe(result);
});

it("localizes the unit for English", () => {
  expect(formatRecordedStudyTime("en", 20_000, 1)).toBe("20 sec");
});
