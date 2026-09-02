import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

/**
 * `es` es el idioma de referencia (`routing.defaultLocale`). Este test bloquea
 * dos formas de "traducción incompleta":
 *
 * - una clave que existe en `es` y falta en `en` → la pantalla en inglés
 *   renderiza la clave cruda;
 * - una clave que existe en `en` y ya no en `es` → mensaje muerto, y probable
 *   despiste al traducir.
 *
 * Camina el árbol entero: una comparación plana de `Object.keys` pasaría con
 * `Auth.login.submit` ausente.
 */

type Json = Record<string, unknown>;

function leafPaths(obj: Json, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? leafPaths(value as Json, path)
      : [path];
  });
}

function valueAt(obj: Json, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc as Json)?.[key], obj);
}

describe("paridad de traducciones es/en", () => {
  const esPaths = leafPaths(es).sort();
  const enPaths = leafPaths(en).sort();

  it("no falta en `en` ninguna clave de `es`", () => {
    expect(esPaths.filter((path) => !enPaths.includes(path))).toEqual([]);
  });

  it("`en` no tiene claves que `es` no tenga", () => {
    expect(enPaths.filter((path) => !esPaths.includes(path))).toEqual([]);
  });

  it("todos los valores son cadenas no vacías en los dos idiomas", () => {
    for (const path of esPaths) {
      expect(valueAt(es, path), `es: ${path}`).toBeTypeOf("string");
      expect(String(valueAt(es, path)).trim(), `es vacío: ${path}`).not.toBe("");
    }
    for (const path of enPaths) {
      expect(valueAt(en, path), `en: ${path}`).toBeTypeOf("string");
      expect(String(valueAt(en, path)).trim(), `en vacío: ${path}`).not.toBe("");
    }
  });
});
