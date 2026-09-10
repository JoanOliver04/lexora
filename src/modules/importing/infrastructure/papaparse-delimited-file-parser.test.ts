import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createPapaParseDelimitedFileParser } from "./papaparse-delimited-file-parser";

/**
 * Suite de casos válidos/adversos del parser delimitado (LEX-4.2), sobre las
 * fixtures sintéticas de LEX-4.1. Cada fixture prueba exactamente lo que su
 * nombre dice; ver `docs/IMPORT_FORMAT.md`.
 */

const parser = createPapaParseDelimitedFileParser();

function fixture(name: string): string {
  return readFileSync(resolve(process.cwd(), "tests/fixtures/import", name), "utf8");
}

describe("createPapaParseDelimitedFileParser", () => {
  it("lee un TSV básico sin directivas: separador por heurística", () => {
    const result = parser.parse(fixture("basic-tab.txt"));

    expect(result.separator).toBe("tab");
    expect(result.separatorFromDirective).toBe(false);
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 1, front: "break the ice", back: "romper el hielo", tags: ["idioms"] },
      { rowNumber: 2, front: "take off", back: "despegar", tags: ["phrasal_verbs"] },
    ]);
  });

  it("respeta la directiva `#separator:` y numera las filas tras la cabecera", () => {
    const result = parser.parse(fixture("directives.txt"));

    expect(result.separator).toBe("tab");
    expect(result.separatorFromDirective).toBe(true);
    expect(result.issues).toEqual([]);
    // 4 líneas directivas → la primera fila de datos es la línea 5.
    expect(result.rows).toEqual([
      { rowNumber: 5, front: "achievement", back: "logro", tags: ["vocabulary::nouns"] },
      { rowNumber: 6, front: "give up", back: "rendirse", tags: ["phrasal_verbs::common"] },
    ]);
  });

  it("CSV con coma", () => {
    const result = parser.parse(fixture("comma.csv"));

    expect(result.separator).toBe("comma");
    expect(result.rows).toEqual([
      { rowNumber: 1, front: "break the ice", back: "romper el hielo", tags: ["idioms"] },
      { rowNumber: 2, front: "take off", back: "despegar", tags: ["phrasal_verbs"] },
    ]);
  });

  it("CSV con punto y coma", () => {
    const result = parser.parse(fixture("semicolon.csv"));

    expect(result.separator).toBe("semicolon");
    expect(result.rows).toEqual([
      { rowNumber: 1, front: "break the ice", back: "romper el hielo", tags: ["idioms"] },
      { rowNumber: 2, front: "take off", back: "despegar", tags: ["phrasal_verbs"] },
    ]);
  });

  it("en TSV las comillas son literales, no abren un campo RFC 4180", () => {
    const result = parser.parse(fixture("quotes-in-tab.txt"));

    expect(result.separator).toBe("tab");
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      {
        rowNumber: 1,
        front: 'he said "hello"',
        back: 'él dijo "hola"',
        tags: ["dialogue"],
      },
      { rowNumber: 2, front: "normal", back: "normal", tags: ["tags"] },
    ]);
  });

  it("campos entrecomillados: el separador dentro de comillas no parte la columna", () => {
    const result = parser.parse(fixture("quoted-fields.csv"));

    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 1, front: "Bien, gracias", back: "Fine, thanks", tags: ["greetings"] },
      {
        rowNumber: 2,
        front: 'She said "hello"',
        back: 'Ella dijo "hola"',
        tags: ["dialogue::greetings"],
      },
    ]);
  });

  it("varias etiquetas jerárquicas `::` en el mismo campo, separadas por espacio", () => {
    const result = parser.parse(fixture("hierarchical-tags.txt"));

    expect(result.rows[0]).toEqual({
      rowNumber: 1,
      front: "achievement",
      back: "logro",
      tags: ["grammar::tenses::present_perfect", "vocabulary::nouns"],
    });
  });

  it("descarta el BOM inicial: no forma parte del primer campo", () => {
    const result = parser.parse(fixture("bom-utf8.txt"));

    expect(result.rows).toEqual([
      {
        rowNumber: 1,
        front: "café con leche",
        back: "coffee with milk",
        tags: ["vocabulary::food"],
      },
    ]);
  });

  it("una línea `#` después de la primera fila de datos es fila literal, no directiva", () => {
    const result = parser.parse(fixture("comment-line-not-a-directive.txt"));

    // 2 directivas → datos desde la línea 3.
    expect(result.rows).toEqual([
      { rowNumber: 3, front: "break the ice", back: "romper el hielo", tags: ["idioms"] },
      { rowNumber: 4, front: "#1 rule", back: "regla número uno", tags: ["grammar::rules"] },
    ]);
  });

  it("HTML se convierte en texto plano: el script no sobrevive y #html:true no cambia eso", () => {
    const result = parser.parse(fixture("html-tags.txt"));

    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      { rowNumber: 2, front: "break the ice", back: "romper el hielo", tags: ["idioms"] },
      { rowNumber: 3, front: "take off", back: "despegar", tags: ["phrasal_verbs"] },
    ]);
  });

  it("entradas adversas no lanzan: el parser clasifica o deja el archivo vacío", () => {
    const payloads = [
      "",
      "\n\n\n",
      "#separator:tab\n",
      "#notetype:Basic\n#separator:tab\nhello\thola\ttags\n",
      "a\tb\ttags\r\nb\tc\ttags\r\n",
      '=cmd|"/c calc"\tback\ttags\n',
      "front\tback\ttags\n\0still-here\tback\ttags\n",
      "#html:true\n<script>alert(1)</script>\tworld\ttags\n",
    ];

    for (const payload of payloads) {
      expect(() => parser.parse(payload)).not.toThrow();
    }

    const formula = parser.parse("=1+1\tback\ttags\n");
    expect(formula.rows[0]?.front).toBe("=1+1");

    const unknownDirective = parser.parse("#notetype:Basic\n#separator:tab\nhello\thola\ttags\n");
    expect(unknownDirective.issues).toEqual([]);
    expect(unknownDirective.rows).toEqual([
      { rowNumber: 3, front: "hello", back: "hola", tags: ["tags"] },
    ]);
  });

  it("filas inválidas: cada una con su código y su número de línea", () => {
    const result = parser.parse(fixture("errors.txt"));

    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([
      { rowNumber: 1, code: "front_empty" },
      { rowNumber: 2, code: "back_empty" },
      { rowNumber: 3, code: "too_few_columns" },
      { rowNumber: 4, code: "too_many_columns" },
    ]);
  });
});
