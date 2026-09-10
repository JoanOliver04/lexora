import { describe, expect, it } from "vitest";

import {
  DEFAULT_DUPLICATE_STRATEGY,
  classifyImportRows,
  parseDuplicateStrategy,
} from "./duplicates";

describe("classifyImportRows", () => {
  it("todas nuevas si el curso está vacío y no hay claves repetidas", () => {
    const result = classifyImportRows(
      [
        { rowNumber: 1, key: "break the ice" },
        { rowNumber: 2, key: "take off" },
      ],
      new Set(),
    );
    expect(result.newCount).toBe(2);
    expect(result.duplicateCount).toBe(0);
    expect(result.isDuplicate.size).toBe(0);
  });

  it("una clave que ya existe en el curso es duplicada, las otras nuevas", () => {
    const result = classifyImportRows(
      [
        { rowNumber: 1, key: "break the ice" },
        { rowNumber: 2, key: "take off" },
      ],
      new Set(["break the ice"]),
    );
    expect(result.newCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.isDuplicate.has(1)).toBe(true);
    expect(result.isDuplicate.has(2)).toBe(false);
    expect(result.duplicateKeys).toEqual(["break the ice"]);
  });

  it("segunda aparición en el archivo es duplicada aunque el curso esté vacío", () => {
    const result = classifyImportRows(
      [
        { rowNumber: 1, key: "hello" },
        { rowNumber: 3, key: "hello" },
        { rowNumber: 4, key: "goodbye" },
      ],
      new Set(),
    );
    expect(result.newCount).toBe(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.isDuplicate.has(1)).toBe(false);
    expect(result.isDuplicate.has(3)).toBe(true);
    expect(result.fileRowsByKey.get("hello")).toEqual([1, 3]);
  });

  it("si la clave ya está en el curso, también la primera fila del archivo es duplicada", () => {
    const result = classifyImportRows(
      [
        { rowNumber: 1, key: "hello" },
        { rowNumber: 2, key: "hello" },
      ],
      new Set(["hello"]),
    );
    expect(result.newCount).toBe(0);
    expect(result.duplicateCount).toBe(2);
    expect(result.isDuplicate.has(1)).toBe(true);
    expect(result.isDuplicate.has(2)).toBe(true);
  });
});

describe("parseDuplicateStrategy", () => {
  it("copy solo si el valor es exactamente copy; cualquier otra cosa es skip", () => {
    expect(parseDuplicateStrategy("copy")).toBe("copy");
    expect(parseDuplicateStrategy("skip")).toBe("skip");
    expect(parseDuplicateStrategy("update")).toBe(DEFAULT_DUPLICATE_STRATEGY);
    expect(parseDuplicateStrategy(undefined)).toBe("skip");
    expect(parseDuplicateStrategy("")).toBe("skip");
  });
});
