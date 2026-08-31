import { describe, expect, it } from "vitest";

import { resolveSafeRedirect } from "./safe-redirect";

describe("resolveSafeRedirect", () => {
  it("acepta una ruta absoluta de este sitio", () => {
    expect(resolveSafeRedirect("/es/app")).toBe("/es/app");
    expect(resolveSafeRedirect("/")).toBe("/");
    expect(resolveSafeRedirect("/en/onboarding?step=2")).toBe("/en/onboarding?step=2");
  });

  it("recorta los espacios de los extremos antes de decidir", () => {
    expect(resolveSafeRedirect("  /es/app  ")).toBe("/es/app");
  });

  it("rechaza un destino con host: protocolo relativo", () => {
    expect(resolveSafeRedirect("//evil.com")).toBe("/");
    expect(resolveSafeRedirect("/\\evil.com")).toBe("/");
    expect(resolveSafeRedirect("/\\/evil.com")).toBe("/");
  });

  it("rechaza una URL absoluta con esquema", () => {
    expect(resolveSafeRedirect("https://evil.com/login")).toBe("/");
    expect(resolveSafeRedirect("http://evil.com")).toBe("/");
  });

  it("rechaza un esquema peligroso", () => {
    expect(resolveSafeRedirect("javascript:alert(1)")).toBe("/");
    expect(resolveSafeRedirect("/x/javascript:alert(1)")).toBe("/");
  });

  it("rechaza barras invertidas y caracteres de control", () => {
    expect(resolveSafeRedirect("/a\\b")).toBe("/");
    expect(resolveSafeRedirect("/a\tb")).toBe("/");
    expect(resolveSafeRedirect("/a b")).toBe("/");
    expect(resolveSafeRedirect("/a\nb")).toBe("/");
  });

  it("rechaza lo que no es una cadena o no empieza por barra", () => {
    expect(resolveSafeRedirect(null)).toBe("/");
    expect(resolveSafeRedirect(undefined)).toBe("/");
    expect(resolveSafeRedirect("")).toBe("/");
    expect(resolveSafeRedirect("es/app")).toBe("/");
  });

  it("usa el fallback indicado en lugar de la raíz", () => {
    expect(resolveSafeRedirect(null, "/es")).toBe("/es");
    expect(resolveSafeRedirect("//evil.com", "/en")).toBe("/en");
  });
});
