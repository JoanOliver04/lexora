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
  it.each(IMPORT_LESSON_TYPES)("imports every %s example in both answer languages", (type) => {
    for (const language of ["es", "en"] as const) {
      const rows = importTemplateRows(type, language);
      const result = parser.parse(serializeImportTemplate(rows));

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
