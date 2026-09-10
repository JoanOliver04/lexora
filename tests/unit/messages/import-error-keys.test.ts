import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import type { ImportPersistErrorCode } from "@/modules/importing/application/import-job";
import { IMPORT_ROW_ISSUE_CODES } from "@/modules/importing/domain/row";

const PERSIST_CODES: ImportPersistErrorCode[] = [...IMPORT_ROW_ISSUE_CODES, "rejected"];

const FILE_ERRORS = [
  "no-file",
  "empty-file",
  "read-failed",
  "too-large",
  "too-many-rows",
  "unavailable",
  "no-deck",
  "empty",
] as const;

describe("claves de error de importación", () => {
  it("cada código de fila tiene mensaje en es y en en", () => {
    for (const code of PERSIST_CODES) {
      expect(es.Import.issue, `es: falta issue.${code}`).toHaveProperty(code);
      expect(en.Import.issue, `en: falta issue.${code}`).toHaveProperty(code);
    }
  });

  it("cada error de archivo tiene mensaje en es y en en", () => {
    for (const code of FILE_ERRORS) {
      expect(es.Import.errors, `es: falta errors.${code}`).toHaveProperty(code);
      expect(en.Import.errors, `en: falta errors.${code}`).toHaveProperty(code);
    }
  });
});
