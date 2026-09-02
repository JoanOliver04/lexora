import { describe, expect, it } from "vitest";

import {
  isPracticeMode,
  isV1PracticeMode,
  normalizeWhitespace,
  PRACTICE_MODES,
  readOptionalText,
  V1_PRACTICE_MODES,
} from "./taxonomy";

describe("normalizeWhitespace", () => {
  it("recorta los extremos y colapsa espacios internos", () => {
    expect(normalizeWhitespace("  hola   mundo \t\n ")).toBe("hola mundo");
  });

  it("no toca acentos ni mayúsculas", () => {
    expect(normalizeWhitespace(" Ábaco ")).toBe("Ábaco");
  });
});

describe("readOptionalText", () => {
  it("convierte lo vacío o ausente en null", () => {
    expect(readOptionalText("")).toBeNull();
    expect(readOptionalText("   ")).toBeNull();
    expect(readOptionalText(undefined)).toBeNull();
    expect(readOptionalText(null)).toBeNull();
    expect(readOptionalText(42)).toBeNull();
  });

  it("recorta los extremos de un texto real", () => {
    expect(readOptionalText("  nota  ")).toBe("nota");
  });
});

describe("modos de práctica", () => {
  it("reserva los siete de §13.9 y solo activa tres en la V1", () => {
    expect(PRACTICE_MODES).toHaveLength(7);
    expect(V1_PRACTICE_MODES).toEqual(["basic_recognition", "basic_recall", "cloze"]);
  });

  it("isPracticeMode reconoce cualquiera de los siete; isV1PracticeMode solo los activos", () => {
    for (const mode of PRACTICE_MODES) {
      expect(isPracticeMode(mode)).toBe(true);
    }
    expect(isV1PracticeMode("listening_dictation")).toBe(false);
    expect(isPracticeMode("listening_dictation")).toBe(true);
    expect(isPracticeMode("nope")).toBe(false);
  });
});
