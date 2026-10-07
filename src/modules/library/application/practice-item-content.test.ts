import { describe, expect, it } from "vitest";

import type { PracticeItemConfig } from "@/modules/library/domain/practice-item";
import { practiceItemContentFrom, practiceItemPromptFrom } from "./practice-item-content";

const basic = {
  mode: "basic_recognition" as const,
  promptText: "<b>Hello</b>\nHow are you?",
  hintText: "A greeting",
  answerText: "Hola",
  config: { mode: "basic_recognition" as const },
};
describe("practice item content", () => {
  it.each(["basic_recognition", "basic_recall"] as const)(
    "preserves %s direction and literal text",
    (mode) => {
      expect(practiceItemContentFrom({ ...basic, mode, config: { mode } })).toEqual({
        mode,
        promptText: basic.promptText,
        hintText: basic.hintText,
        answerText: "Hola",
        clozeAnswers: [],
      });
    },
  );
  it("preserves cloze prompts and solution order without inferring a marker", () => {
    expect(
      practiceItemContentFrom({
        ...basic,
        mode: "cloze",
        promptText: "I ___ and [gap].",
        config: { mode: "cloze", answers: [" walk ", "", "run", "walk"] },
      }),
    ).toMatchObject({
      promptText: "I ___ and [gap].",
      clozeAnswers: ["walk", "run", "walk"],
    });
  });
  it.each([
    "listening_dictation",
    "guided_production",
    "free_production",
    "pronunciation",
  ] as const)("rejects reserved mode %s", (mode) => {
    expect(practiceItemContentFrom({ ...basic, mode, config: { mode } })).toBeNull();
  });
  it("rejects mismatched config, empty solutions and invalid content", () => {
    expect(
      practiceItemContentFrom({ ...basic, config: { mode: "cloze", answers: ["x"] } }),
    ).toBeNull();
    expect(
      practiceItemContentFrom({ ...basic, mode: "cloze", config: { mode: "cloze", answers: [] } }),
    ).toBeNull();
    expect(practiceItemContentFrom({ ...basic, promptText: " " })).toBeNull();
    expect(practiceItemContentFrom({ ...basic, answerText: "" })).toBeNull();
    expect(
      practiceItemContentFrom({ ...basic, config: null as unknown as PracticeItemConfig }),
    ).toBeNull();
  });
  it("projects only the front, not solutions or any extra persisted metadata", () => {
    const content = practiceItemContentFrom(basic)!;
    expect(practiceItemPromptFrom({ ...content, clozeAnswers: ["secret"] })).toEqual({
      mode: "basic_recognition",
      promptText: basic.promptText,
      hintText: basic.hintText,
    });
    expect(JSON.stringify(practiceItemPromptFrom(content))).not.toContain("Hola");
  });
});
