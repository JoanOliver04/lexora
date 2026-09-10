import { describe, expect, it } from "vitest";

import { hashImportContent } from "./content-hash";

describe("hashImportContent", () => {
  it("SHA-256 hex de 64 caracteres, estable para el mismo contenido", () => {
    const hash = hashImportContent("a\tb\ttags\n");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
    expect(hashImportContent("a\tb\ttags\n")).toBe(hash);
  });

  it("cambia si cambia el contenido", () => {
    expect(hashImportContent("a")).not.toBe(hashImportContent("b"));
  });
});
