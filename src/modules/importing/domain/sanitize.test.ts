import { describe, expect, it } from "vitest";

import { MAX_ROW_SAMPLE_LENGTH } from "./limits";
import { sanitizeRowSample, stripImportedHtml } from "./sanitize";

describe("stripImportedHtml", () => {
  it("deja texto sin etiquetas igual", () => {
    expect(stripImportedHtml("break the ice")).toBe("break the ice");
  });

  it("conserva un `<` que no es etiqueta (`3 < 5`)", () => {
    expect(stripImportedHtml("3 < 5")).toBe("3 < 5");
  });

  it("quita `<script>` con su contenido, no solo la etiqueta", () => {
    expect(stripImportedHtml("hello<script>alert(1)</script>world")).toBe("hello world");
  });

  it("neutraliza `<img onerror>` y otras etiquetas sueltas", () => {
    expect(stripImportedHtml("<img src=x onerror=alert(1)>plain")).toBe("plain");
    expect(stripImportedHtml("<b>bold</b>")).toBe("bold");
  });

  it("un campo que solo era HTML vacío queda en blanco tras el recorte del llamador", () => {
    expect(stripImportedHtml("<p></p>").trim()).toBe("");
    expect(stripImportedHtml("<script>alert(1)</script>").trim()).toBe("");
  });

  it("decodifica entidades básicas después de quitar etiquetas", () => {
    expect(stripImportedHtml("A &amp; B")).toBe("A & B");
    expect(stripImportedHtml("&lt;div&gt;")).toBe("<div>");
  });
});

describe("sanitizeRowSample", () => {
  it("quita controles y recorta a 200", () => {
    expect(sanitizeRowSample("a\u0000b")).toBe("ab");
    const long = "x".repeat(MAX_ROW_SAMPLE_LENGTH + 50);
    expect(sanitizeRowSample(long)).toHaveLength(MAX_ROW_SAMPLE_LENGTH);
  });

  it("no incluye la fila entera si es más larga que el tope", () => {
    const row = `front | ${"back ".repeat(80)} | tags`;
    const sample = sanitizeRowSample(row);
    expect(sample.length).toBeLessThanOrEqual(MAX_ROW_SAMPLE_LENGTH);
    expect(row.startsWith(sample)).toBe(true);
  });
});
