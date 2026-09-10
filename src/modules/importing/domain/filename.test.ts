import { describe, expect, it } from "vitest";

import { MAX_FILENAME_LENGTH } from "./limits";
import { FALLBACK_FILENAME, sanitizeFilename } from "./filename";

describe("sanitizeFilename", () => {
  it("deja un nombre simple intacto", () => {
    expect(sanitizeFilename("mazo.txt")).toBe("mazo.txt");
  });

  it("se queda solo con el último segmento de una ruta Unix o Windows", () => {
    expect(sanitizeFilename("/tmp/../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\Users\\Joan\\mazo.csv")).toBe("mazo.csv");
  });

  it("colapsa `..` y rechaza un nombre que solo es puntos", () => {
    expect(sanitizeFilename("..")).toBe(FALLBACK_FILENAME);
    expect(sanitizeFilename("...")).toBe(FALLBACK_FILENAME);
    expect(sanitizeFilename("foo..bar.txt")).toBe("foo.bar.txt");
  });

  it("quita caracteres de control", () => {
    expect(sanitizeFilename("mazo\u0000.txt")).toBe("mazo.txt");
    expect(sanitizeFilename("mazo\n.txt")).toBe("mazo.txt");
  });

  it("recorta a 255 caracteres", () => {
    const long = `${"a".repeat(300)}.txt`;
    expect(sanitizeFilename(long)).toHaveLength(MAX_FILENAME_LENGTH);
  });

  it("entrada vacía, no-string o solo espacios → reserva", () => {
    expect(sanitizeFilename("")).toBe(FALLBACK_FILENAME);
    expect(sanitizeFilename("   ")).toBe(FALLBACK_FILENAME);
    expect(sanitizeFilename(null)).toBe(FALLBACK_FILENAME);
    expect(sanitizeFilename(undefined)).toBe(FALLBACK_FILENAME);
  });
});
