import { describe, expect, it } from "vitest";

import { CONCEPT_KINDS } from "./taxonomy";
import { canonicalKey, isArchived, validateConceptDraft } from "./concept";

const valid = {
  kind: "vocabulary",
  title: "achievement",
  summary: "logro",
  explanation: null,
  example: "Getting this job would be a great achievement.",
  cefrLevel: "B1",
  sourceReference: null,
} as const;

describe("canonicalKey", () => {
  it("pasa a minúsculas y colapsa espacios", () => {
    expect(canonicalKey("  Great   Achievement ")).toBe("great achievement");
  });

  it("no quita acentos: 'práctica' y 'practica' no colisionan", () => {
    expect(canonicalKey("práctica")).not.toBe(canonicalKey("practica"));
  });
});

describe("validateConceptDraft", () => {
  it("acepta un borrador válido y normaliza los textos obligatorios", () => {
    const result = validateConceptDraft({ ...valid, title: "  achievement " });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("achievement");
      expect(result.value.summary).toBe("logro");
      expect(result.value.sourceReference).toBeNull();
    }
  });

  it("acepta cada tipo de concepto del vocabulario cerrado", () => {
    for (const kind of CONCEPT_KINDS) {
      expect(validateConceptDraft({ ...valid, kind }).ok).toBe(true);
    }
  });

  it("exige título y resumen; acumula las dos ausencias", () => {
    const result = validateConceptDraft({ kind: "vocabulary", title: "  ", summary: "" });
    expect(result).toEqual({
      ok: false,
      issues: ["concept.title.empty", "concept.summary.empty"],
    });
  });

  it("rechaza un tipo desconocido", () => {
    const result = validateConceptDraft({ ...valid, kind: "idiom" });
    expect(result).toEqual({ ok: false, issues: ["concept.kind.invalid"] });
  });

  it("rechaza una explicación más larga que el máximo", () => {
    const result = validateConceptDraft({ ...valid, explanation: "x".repeat(4001) });
    expect(result).toEqual({ ok: false, issues: ["concept.explanation.tooLong"] });
  });

  it("rechaza un nivel que no es MCER", () => {
    const result = validateConceptDraft({ ...valid, cefrLevel: "C2" });
    expect(result).toEqual({ ok: false, issues: ["concept.cefrLevel.invalid"] });
  });
});

describe("isArchived", () => {
  it("depende solo de archivedAt", () => {
    expect(isArchived({ archivedAt: null })).toBe(false);
    expect(isArchived({ archivedAt: "2026-01-01T00:00:00Z" })).toBe(true);
  });
});
