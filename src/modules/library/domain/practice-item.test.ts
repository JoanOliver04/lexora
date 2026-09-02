import { describe, expect, it } from "vitest";

import { canReverse, reverseOf, validatePracticeItemDraft } from "./practice-item";

const recognition = {
  mode: "basic_recognition",
  promptText: "achievement",
  answerText: "logro",
  hintText: null,
  config: { mode: "basic_recognition" },
} as const;

describe("validatePracticeItemDraft", () => {
  it("acepta un ítem de reconocimiento básico", () => {
    expect(validatePracticeItemDraft(recognition)).toEqual({ ok: true, value: recognition });
  });

  it("acepta un cloze con soluciones y las limpia", () => {
    const result = validatePracticeItemDraft({
      mode: "cloze",
      promptText: "I have ___ a lot this year.",
      answerText: "achieved",
      hintText: null,
      config: { mode: "cloze", answers: [" achieved ", ""] },
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.config.mode === "cloze") {
      expect(result.value.config.answers).toEqual(["achieved"]);
    }
  });

  it("rechaza un modo reservado pero no activable en la V1", () => {
    const result = validatePracticeItemDraft({
      ...recognition,
      mode: "listening_dictation",
      config: { mode: "listening_dictation" },
    });
    expect(result).toEqual({ ok: false, issues: ["practiceItem.mode.notAvailableInV1"] });
  });

  it("rechaza un modo desconocido y no arrastra ruido de config", () => {
    const result = validatePracticeItemDraft({ ...recognition, mode: "quiz", config: {} });
    expect(result).toEqual({ ok: false, issues: ["practiceItem.mode.invalid"] });
  });

  it("rechaza un config cuyo mode no coincide con el del ítem", () => {
    const result = validatePracticeItemDraft({
      ...recognition,
      config: { mode: "basic_recall" },
    });
    expect(result).toEqual({ ok: false, issues: ["practiceItem.config.modeMismatch"] });
  });

  it("rechaza un cloze sin soluciones utilizables", () => {
    const result = validatePracticeItemDraft({
      mode: "cloze",
      promptText: "___",
      answerText: "x",
      hintText: null,
      config: { mode: "cloze", answers: ["  ", ""] },
    });
    expect(result).toEqual({ ok: false, issues: ["practiceItem.config.clozeAnswersEmpty"] });
  });

  it("exige enunciado y respuesta, y acumula las dos ausencias", () => {
    const result = validatePracticeItemDraft({
      mode: "basic_recall",
      promptText: "  ",
      answerText: "",
      hintText: null,
      config: { mode: "basic_recall" },
    });
    expect(result).toEqual({
      ok: false,
      issues: ["practiceItem.promptText.empty", "practiceItem.answerText.empty"],
    });
  });
});

describe("dirección inversa", () => {
  it("canReverse solo para reconocimiento y recuperación", () => {
    expect(canReverse("basic_recognition")).toBe(true);
    expect(canReverse("basic_recall")).toBe(true);
    expect(canReverse("cloze")).toBe(false);
    expect(canReverse("free_production")).toBe(false);
  });

  it("intercambia enunciado y respuesta y cambia el modo, sin arrastrar la pista", () => {
    const reversed = reverseOf({ ...recognition, hintText: "una pista" });
    expect(reversed).toEqual({
      mode: "basic_recall",
      promptText: "logro",
      answerText: "achievement",
      hintText: null,
      config: { mode: "basic_recall" },
    });
  });

  it("aplicada dos veces vuelve al original (salvo la pista)", () => {
    const once = reverseOf(recognition);
    expect(once && reverseOf(once)).toEqual(recognition);
  });

  it("devuelve null para un modo sin inversa con sentido", () => {
    expect(
      reverseOf({
        mode: "cloze",
        promptText: "___",
        answerText: "x",
        hintText: null,
        config: { mode: "cloze", answers: ["x"] },
      }),
    ).toBeNull();
  });
});
