import { describe, expect, it } from "vitest";

import { FALLBACK_FILENAME } from "@/modules/importing/domain/filename";
import { MAX_FILE_BYTES, MAX_ROWS } from "@/modules/importing/domain/limits";

import { inspectImportUpload, issuesWithSamples, previewRowSample } from "./preview";

describe("inspectImportUpload", () => {
  it("acepta un archivo pequeño y sanea el nombre", () => {
    expect(
      inspectImportUpload({
        filename: "C:\\\\tmp\\\\mazo.txt",
        byteSize: 12,
        content: "a\tb\tt\n",
      }),
    ).toEqual({ ok: true, filename: "mazo.txt" });
  });

  it("rechaza por tamaño sin importar el contenido", () => {
    expect(
      inspectImportUpload({
        filename: "huge.txt",
        byteSize: MAX_FILE_BYTES + 1,
        content: "a",
      }),
    ).toEqual({ ok: false, error: "too-large", filename: "huge.txt" });
  });

  it("archivo solo de espacios → empty-file", () => {
    expect(
      inspectImportUpload({
        filename: "",
        byteSize: 3,
        content: "  \n",
      }),
    ).toEqual({ ok: false, error: "empty-file", filename: FALLBACK_FILENAME });
  });

  it("demasiadas filas → too-many-rows", () => {
    const content = Array.from({ length: MAX_ROWS + 2 }, () => "a").join("\n");
    expect(
      inspectImportUpload({
        filename: "many.txt",
        byteSize: content.length,
        content,
      }),
    ).toEqual({ ok: false, error: "too-many-rows", filename: "many.txt" });
  });
});

describe("previewRowSample / issuesWithSamples", () => {
  it("acota la muestra y no deja controles", () => {
    expect(previewRowSample(["a\u0000b", "c"])).toBe("ab | c");
  });

  it("cuelga la muestra de cada problema por número de fila", () => {
    const issues = issuesWithSamples(
      [{ rowNumber: 2, code: "front_empty" }],
      [
        { rowNumber: 1, columns: ["ok", "ok"] },
        { rowNumber: 2, columns: ["", "back", "t"] },
      ],
    );
    expect(issues).toEqual([{ rowNumber: 2, code: "front_empty", sample: " | back | t" }]);
  });
});
