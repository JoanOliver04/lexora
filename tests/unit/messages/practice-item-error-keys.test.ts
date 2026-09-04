import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { practiceItemIssueKey } from "@/app/[locale]/(app)/concepts/message-key";
import type { PracticeItemIssue } from "@/modules/library/domain/practice-item";

/**
 * El puente entre `validatePracticeItemDraft` (dominio) y las traducciones es
 * `practiceItemIssueKey`. Cada `PracticeItemIssue` tiene mensaje en los dos
 * idiomas, bajo `Concepts.items.errors` (LEX-3.7).
 */
const ISSUES = [
  "practiceItem.mode.invalid",
  "practiceItem.mode.notAvailableInV1",
  "practiceItem.promptText.empty",
  "practiceItem.promptText.tooLong",
  "practiceItem.answerText.empty",
  "practiceItem.answerText.tooLong",
  "practiceItem.hintText.tooLong",
  "practiceItem.config.modeMismatch",
  "practiceItem.config.clozeAnswersEmpty",
] as const satisfies readonly PracticeItemIssue[];

describe("claves de error de ítems de práctica", () => {
  it("transforma la clave de dominio a la clave plana de i18n", () => {
    expect(practiceItemIssueKey("practiceItem.mode.invalid")).toBe("mode_invalid");
    expect(practiceItemIssueKey("practiceItem.config.clozeAnswersEmpty")).toBe(
      "config_clozeAnswersEmpty",
    );
  });

  it("cada PracticeItemIssue tiene mensaje en es y en en", () => {
    for (const issue of ISSUES) {
      const key = practiceItemIssueKey(issue);
      expect(es.Concepts.items.errors, `es: falta ${key}`).toHaveProperty(key);
      expect(en.Concepts.items.errors, `en: falta ${key}`).toHaveProperty(key);
    }
  });
});
