import { describe, expect, it } from "vitest";

import { isProtectedPath } from "./protected-paths";

describe("isProtectedPath", () => {
  it("reconoce el área autenticada en cada idioma", () => {
    expect(isProtectedPath("/es/app")).toBe(true);
    expect(isProtectedPath("/en/app")).toBe(true);
    expect(isProtectedPath("/es/app/")).toBe(true);
    expect(isProtectedPath("/es/app/decks")).toBe(true);
  });

  it("no confunde una ruta que solo empieza igual", () => {
    expect(isProtectedPath("/es/apple")).toBe(false);
    expect(isProtectedPath("/es/application")).toBe(false);
  });

  it("exige el prefijo de idioma", () => {
    expect(isProtectedPath("/app")).toBe(false);
    expect(isProtectedPath("/fr/app")).toBe(false);
  });

  it("no se salta por may/min ni por rutas públicas", () => {
    expect(isProtectedPath("/es/APP")).toBe(false);
    expect(isProtectedPath("/es")).toBe(false);
    expect(isProtectedPath("/es/login")).toBe(false);
  });

  it("cierra la evasión por porcentaje-codificación", () => {
    expect(isProtectedPath("/es/%61pp")).toBe(true);
    expect(isProtectedPath("/es/app%2Fx")).toBe(true);
  });

  it("no lanza con un pathname mal formado", () => {
    expect(isProtectedPath("/es/%ZZ")).toBe(false);
  });
});
