import { describe, expect, it } from "vitest";

import { detectSeparator, parseSeparatorDirective, separatorChar } from "./separator";

describe("parseSeparatorDirective", () => {
  it("reconoce los tres nombres documentados, sin distinguir mayúsculas ni espacios", () => {
    expect(parseSeparatorDirective("tab")).toBe("tab");
    expect(parseSeparatorDirective("  COMMA ")).toBe("comma");
    expect(parseSeparatorDirective("Semicolon")).toBe("semicolon");
  });

  it("cualquier otro valor devuelve null (→ heurística)", () => {
    expect(parseSeparatorDirective("pipe")).toBeNull();
    expect(parseSeparatorDirective("")).toBeNull();
  });
});

describe("detectSeparator", () => {
  it("una tabulación en la primera línea gana a todo", () => {
    expect(detectSeparator("a\tb,c;d")).toBe("tab");
  });

  it("sin tabulación, elige entre coma y punto y coma por frecuencia", () => {
    expect(detectSeparator("a;b;c")).toBe("semicolon");
    expect(detectSeparator("a,b,c")).toBe("comma");
  });

  it("empate o ninguno → coma", () => {
    expect(detectSeparator("a,b;c")).toBe("comma");
    expect(detectSeparator("solo texto")).toBe("comma");
  });
});

describe("separatorChar", () => {
  it("mapea a los caracteres reales", () => {
    expect(separatorChar("tab")).toBe("\t");
    expect(separatorChar("comma")).toBe(",");
    expect(separatorChar("semicolon")).toBe(";");
  });
});
