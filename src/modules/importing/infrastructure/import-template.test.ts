import { describe, expect, it } from "vitest";

import {
  IMPORT_LESSON_TYPES,
  importTemplateRows,
  serializeImportTemplate,
  unwrapPastedImport,
} from "../application/import-template";
import { createPapaParseDelimitedFileParser } from "./papaparse-delimited-file-parser";

const parser = createPapaParseDelimitedFileParser();

describe("import templates", () => {
  it.each(IMPORT_LESSON_TYPES)("round-trips every %s example across course languages", (type) => {
    for (const target of ["en-GB", "fr-FR", "de", "it"] as const) {
      for (const language of ["es", "en", "target"] as const) {
        const rows = importTemplateRows(type, language, target);
        const result = parser.parse(serializeImportTemplate(rows));

        expect(rows.length).toBeGreaterThan(0);
        expect(result.separatorFromDirective).toBe(true);
        expect(result.issues).toEqual([]);
        expect(result.rows).toEqual(
          rows.map(({ front, back, tags }, index) => ({
            rowNumber: index + 2,
            front,
            back,
            tags: [tags],
          })),
        );
      }
    }
  });

  it("keeps the active course's language and supports monolingual examples", () => {
    expect(importTemplateRows("vocabulary", "es", "fr-FR")[0]).toMatchObject({
      front: "le sifflet",
      back: expect.stringContaining("El silbato."),
    });
    expect(importTemplateRows("vocabulary", "target", "de")[0]).toMatchObject({
      front: "die Pfeife",
      back: expect.stringContaining("akustisches Signal"),
    });
    expect(importTemplateRows("phrases", "en", "it")[0]?.front).toBe("Posso provarlo?");
    expect(importTemplateRows("vocabulary", "es", "pt")).toEqual([]);
  });

  it("round-trips commas, quotes and tags through the CSV parser", () => {
    const front = 'Translate "ready, set, go"';
    const back = "Preparados, listos, ya";
    const csv = serializeImportTemplate([{ front, back, tags: "sports::racing commands" }]);

    expect(parser.parse(csv).rows).toEqual([
      { rowNumber: 2, front, back, tags: ["sports::racing", "commands"] },
    ]);
  });
});

describe("unwrapPastedImport", () => {
  it.each(["csv", "tsv", "txt", "text", ""])("unwraps a complete %s fence", (language) => {
    const fence = "```";
    const text = '"front","back","tag"';
    expect(unwrapPastedImport(`\n${fence}${language}\r\n${text}\r\n${fence}\r\n`)).toBe(text);
  });

  it("unwraps an empty fence", () => {
    expect(unwrapPastedImport("```csv\n```")).toBe("");
  });

  it.each(["front\tback  \n", "```csv\nfront,back", "```javascript\nfront,back\n```"])(
    "preserves file contents or unsupported fences unchanged",
    (text) => expect(unwrapPastedImport(text)).toBe(text),
  );
});
