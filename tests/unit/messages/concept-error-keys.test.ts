import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { conceptIssueKey } from "@/app/[locale]/(app)/concepts/message-key";
import type { ConceptIssue } from "@/modules/library/domain/concept";

/**
 * El puente entre `validateConceptDraft` (dominio) y las traducciones es
 * `conceptIssueKey`. Cada `ConceptIssue` tiene mensaje en los dos idiomas —
 * mismo candado que `deck-error-keys.test.ts` (LEX-3.5).
 */
const ISSUES = [
  "concept.kind.invalid",
  "concept.title.empty",
  "concept.title.tooLong",
  "concept.summary.empty",
  "concept.summary.tooLong",
  "concept.explanation.tooLong",
  "concept.example.tooLong",
  "concept.cefrLevel.invalid",
] as const satisfies readonly ConceptIssue[];

describe("claves de error de conceptos", () => {
  it("transforma la clave de dominio a la clave plana de i18n", () => {
    expect(conceptIssueKey("concept.title.empty")).toBe("title_empty");
    expect(conceptIssueKey("concept.kind.invalid")).toBe("kind_invalid");
  });

  it("cada ConceptIssue tiene mensaje en es y en en", () => {
    for (const issue of ISSUES) {
      const key = conceptIssueKey(issue);
      expect(es.Concepts.errors, `es: falta ${key}`).toHaveProperty(key);
      expect(en.Concepts.errors, `en: falta ${key}`).toHaveProperty(key);
    }
  });
});
