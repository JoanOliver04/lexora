import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { tagIssueKey } from "@/app/[locale]/(app)/concepts/message-key";
import type { TagIssue } from "@/modules/library/domain/tag";

/**
 * El puente entre `validateTagDraft` (dominio) y las traducciones es
 * `tagIssueKey`. Cada `TagIssue` tiene mensaje en los dos idiomas, bajo
 * `Concepts.tags.errors` (el formulario de etiquetas vive en la pantalla de
 * concepto, LEX-3.6).
 */
const ISSUES = [
  "tag.name.empty",
  "tag.name.tooLong",
  "tag.name.emptySegment",
] as const satisfies readonly TagIssue[];

describe("claves de error de etiquetas", () => {
  it("transforma la clave de dominio a la clave plana de i18n", () => {
    expect(tagIssueKey("tag.name.empty")).toBe("name_empty");
    expect(tagIssueKey("tag.name.emptySegment")).toBe("name_emptySegment");
  });

  it("cada TagIssue tiene mensaje en es y en en", () => {
    for (const issue of ISSUES) {
      const key = tagIssueKey(issue);
      expect(es.Concepts.tags.errors, `es: falta ${key}`).toHaveProperty(key);
      expect(en.Concepts.tags.errors, `en: falta ${key}`).toHaveProperty(key);
    }
  });
});
