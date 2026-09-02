import { describe, expect, it } from "vitest";

import { normalizeTagName, tagSegments, validateTagDraft } from "./tag";

describe("normalizeTagName", () => {
  it("pasa a minúsculas, recorta y colapsa espacios", () => {
    expect(normalizeTagName("  Phrasal   Verbs ")).toBe("phrasal verbs");
  });

  it("quita los espacios alrededor del separador de jerarquía", () => {
    expect(normalizeTagName("grammar :: tenses :: past")).toBe("grammar::tenses::past");
  });

  it("no quita acentos", () => {
    expect(normalizeTagName("pronunciación")).toBe("pronunciación");
  });
});

describe("tagSegments", () => {
  it("parte por el separador y recorta cada segmento", () => {
    expect(tagSegments("grammar::tenses::past")).toEqual(["grammar", "tenses", "past"]);
  });
});

describe("validateTagDraft", () => {
  it("acepta un nombre plano y deriva el normalizado", () => {
    expect(validateTagDraft({ name: "  Business English " })).toEqual({
      ok: true,
      value: { displayName: "Business English", normalizedName: "business english" },
    });
  });

  it("acepta una jerarquía importada y la normaliza", () => {
    const result = validateTagDraft({ name: "Grammar :: Tenses" });
    expect(result).toEqual({
      ok: true,
      value: { displayName: "Grammar :: Tenses", normalizedName: "grammar::tenses" },
    });
  });

  it("rechaza el vacío", () => {
    expect(validateTagDraft({ name: "   " })).toEqual({ ok: false, issues: ["tag.name.empty"] });
  });

  it("rechaza una jerarquía con un segmento vacío", () => {
    for (const name of ["grammar::", "::grammar", "a::::b"]) {
      expect(validateTagDraft({ name })).toEqual({
        ok: false,
        issues: ["tag.name.emptySegment"],
      });
    }
  });

  it("rechaza un nombre demasiado largo", () => {
    expect(validateTagDraft({ name: "x".repeat(201) })).toEqual({
      ok: false,
      issues: ["tag.name.tooLong"],
    });
  });
});
