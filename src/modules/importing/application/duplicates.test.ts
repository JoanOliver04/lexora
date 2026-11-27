import { describe, expect, it, vi } from "vitest";

import type { Concept } from "@/modules/library/domain/concept";

import { planImportDuplicates } from "./duplicates";

const existing: Concept = {
  id: "concept-1",
  courseId: "course-1",
  ownerId: "user-1",
  kind: "vocabulary",
  title: "Break the ice",
  canonicalKey: "break the ice",
  summary: "empezar una conversación",
  explanation: null,
  example: null,
  cefrLevel: "A1",
  sourceReference: null,
  archivedAt: null,
  createdAt: "2026-09-10T00:00:00Z",
  updatedAt: "2026-09-10T00:00:00Z",
};

describe("planImportDuplicates", () => {
  it("clasifica nuevas vs duplicadas de biblioteca y del propio archivo", async () => {
    const list = vi.fn().mockResolvedValue([existing]);
    const plan = await planImportDuplicates({
      ownerId: "user-1",
      courseId: "course-1",
      validRows: [
        { rowNumber: 1, front: "break the ice", back: "romper el hielo", tags: ["idioms"] },
        { rowNumber: 2, front: "take off", back: "despegar", tags: [] },
        { rowNumber: 3, front: "Take  off", back: "otra vez", tags: [] },
      ],
      invalidCount: 1,
      strategy: "skip",
      concepts: { list },
    });

    expect(list).toHaveBeenCalledWith({ ownerId: "user-1", courseId: "course-1" });
    expect(plan.newCount).toBe(1);
    expect(plan.duplicateCount).toBe(2);
    expect(plan.invalidCount).toBe(1);
    expect(plan.strategy).toBe("skip");
    expect(plan.hits).toEqual([
      {
        rowNumber: 1,
        front: "break the ice",
        existingTitles: ["Break the ice"],
        otherFileRows: [],
      },
      {
        rowNumber: 3,
        front: "Take  off",
        existingTitles: [],
        otherFileRows: [2],
      },
    ]);
  });

  it("agrupa variantes fonéticas del archivo y del vocabulario existente sin cambiar otros tipos", async () => {
    const list = vi.fn().mockResolvedValue([
      { ...existing, title: "Harbour /ˈhɑːbə/", canonicalKey: "harbour /ˈhɑːbə/" },
      { ...existing, kind: "grammar", title: "Rule /X/", canonicalKey: "rule /x/" },
    ]);
    const fronts = [
      "  HARBOUR  /ɑ/",
      "harbour",
      "full /fʊl/",
      "Full /fʊɫ/",
      "Rule",
      "Rule /X/",
      "literal/path",
    ];
    const plan = await planImportDuplicates({
      ownerId: "u",
      courseId: "c",
      validRows: fronts.map((front, index) => ({
        rowNumber: index + 1,
        front,
        back: "gloss",
        tags: [],
      })),
      invalidCount: 0,
      strategy: "skip",
      concepts: { list },
    });
    expect(plan.newCount).toBe(3);
    expect(plan.hits.map((hit) => [hit.rowNumber, hit.existingTitles, hit.otherFileRows])).toEqual([
      [1, ["Harbour /ˈhɑːbə/"], [2]],
      [2, ["Harbour /ˈhɑːbə/"], [1]],
      [4, [], [3]],
      [6, ["Rule /X/"], [5]],
    ]);
  });
  it("sin conceptos en el curso, todo es nuevo", async () => {
    const plan = await planImportDuplicates({
      ownerId: "user-1",
      courseId: "course-1",
      validRows: [{ rowNumber: 1, front: "hello", back: "hola", tags: [] }],
      invalidCount: 0,
      strategy: "copy",
      concepts: { list: vi.fn().mockResolvedValue([]) },
    });
    expect(plan).toEqual({
      strategy: "copy",
      newCount: 1,
      duplicateCount: 0,
      invalidCount: 0,
      hits: [],
    });
  });

  it("ownerId vacío lanza, no consulta", async () => {
    const list = vi.fn();
    await expect(
      planImportDuplicates({
        ownerId: "  ",
        courseId: "course-1",
        validRows: [],
        invalidCount: 0,
        strategy: "skip",
        concepts: { list },
      }),
    ).rejects.toThrow(/identificador de usuario/);
    expect(list).not.toHaveBeenCalled();
  });
});
