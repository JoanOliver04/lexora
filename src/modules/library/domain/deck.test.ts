import { describe, expect, it } from "vitest";

import { DECK_CATEGORIES } from "./taxonomy";
import { isArchived, validateDeckDraft } from "./deck";

const valid = {
  title: "A1 · Vocabulario",
  description: "Palabras del primer nivel",
  cefrLevel: "A1",
  category: "vocabulary",
} as const;

describe("validateDeckDraft", () => {
  it("acepta un borrador completo y normaliza el título", () => {
    const result = validateDeckDraft({ ...valid, title: "  A1 ·   Vocabulario  " });
    expect(result).toEqual({
      ok: true,
      value: {
        title: "A1 · Vocabulario",
        description: "Palabras del primer nivel",
        cefrLevel: "A1",
        category: "vocabulary",
      },
    });
  });

  it("acepta nivel y categoría ausentes (null)", () => {
    const result = validateDeckDraft({ title: "Inglés profesional" });
    expect(result).toEqual({
      ok: true,
      value: { title: "Inglés profesional", description: null, cefrLevel: null, category: null },
    });
  });

  it("acepta cada categoría del vocabulario cerrado", () => {
    for (const category of DECK_CATEGORIES) {
      expect(validateDeckDraft({ title: "x", category }).ok).toBe(true);
    }
  });

  it("rechaza un título vacío o solo espacios", () => {
    expect(validateDeckDraft({ title: "   " })).toEqual({
      ok: false,
      issues: ["deck.title.empty"],
    });
  });

  it("rechaza un título demasiado largo", () => {
    const result = validateDeckDraft({ title: "x".repeat(201) });
    expect(result).toEqual({ ok: false, issues: ["deck.title.tooLong"] });
  });

  it("rechaza nivel y categoría fuera del vocabulario, y acumula las dos pegas", () => {
    const result = validateDeckDraft({ title: "x", cefrLevel: "C1", category: "slang" });
    expect(result).toEqual({
      ok: false,
      issues: ["deck.cefrLevel.invalid", "deck.category.invalid"],
    });
  });

  it("trata una entrada que no es un objeto como un borrador vacío", () => {
    expect(validateDeckDraft(null)).toEqual({ ok: false, issues: ["deck.title.empty"] });
  });
});

describe("isArchived", () => {
  it("es cierto solo cuando hay fecha de archivado", () => {
    expect(isArchived({ archivedAt: null })).toBe(false);
    expect(isArchived({ archivedAt: "2026-09-02T00:00:00Z" })).toBe(true);
  });
});
