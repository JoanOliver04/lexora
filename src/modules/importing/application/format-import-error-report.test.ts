import { describe, expect, it } from "vitest";

import { formatImportErrorReport } from "./format-import-error-report";

describe("formatImportErrorReport", () => {
  it("una línea por error, sin el archivo original", () => {
    const text = formatImportErrorReport([
      { rowNumber: 1, message: "El frente está en blanco.", rowSample: "| back | t" },
      { rowNumber: 3, message: "La fila tiene menos columnas de las necesarias.", rowSample: null },
    ]);
    expect(text).toBe(
      "1\tEl frente está en blanco.\t| back | t\n3\tLa fila tiene menos columnas de las necesarias.",
    );
    expect(text).not.toContain("<script>");
  });

  it("lista vacía → texto vacío", () => {
    expect(formatImportErrorReport([])).toBe("");
  });
});
