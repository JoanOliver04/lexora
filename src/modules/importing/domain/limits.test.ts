import { describe, expect, it } from "vitest";

import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  checkImportInput,
  exceedsFileSize,
  exceedsRowCount,
} from "./limits";

describe("checkImportInput", () => {
  it("acepta un archivo pequeño con pocas filas", () => {
    expect(checkImportInput("a\tb\ttags\n")).toEqual({ ok: true });
  });

  it("rechaza por tamaño antes que por filas", () => {
    const huge = "x".repeat(MAX_FILE_BYTES + 1);
    expect(exceedsFileSize(huge)).toBe(true);
    expect(checkImportInput(huge)).toEqual({ ok: false, code: "too-large" });
  });

  it("un archivo de exactamente MAX_FILE_BYTES cabe", () => {
    const exact = "x".repeat(MAX_FILE_BYTES);
    expect(exceedsFileSize(exact)).toBe(false);
    expect(checkImportInput(exact)).toEqual({ ok: true });
  });

  it("más de MAX_ROWS saltos de línea → too-many-rows", () => {
    const lines = Array.from({ length: MAX_ROWS + 2 }, () => "a\tb\tt").join("\n");
    expect(exceedsRowCount(lines)).toBe(true);
    expect(checkImportInput(lines)).toEqual({ ok: false, code: "too-many-rows" });
  });

  it("exactamente MAX_ROWS saltos de línea (archivo con trailing newline) cabe", () => {
    const lines = Array.from({ length: MAX_ROWS }, () => "a").join("\n") + "\n";
    expect(exceedsRowCount(lines)).toBe(false);
  });
});
