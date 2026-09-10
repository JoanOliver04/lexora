import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { inspectImportUpload } from "@/modules/importing/application/preview";
import { createPapaParseDelimitedFileParser } from "@/modules/importing/infrastructure/papaparse-delimited-file-parser";
import { canonicalKey } from "@/modules/library/domain/concept";

/**
 * LEX-4.10: recuentos y rendimiento del dataset privado. Se salta si
 * `LEXORA_PRIVATE_IMPORT_DIR` no está definido (CI, clones sin el material).
 * No imprime frente/reverso: el repositorio es público.
 */
const dir = process.env["LEXORA_PRIVATE_IMPORT_DIR"];

describe.skipIf(!dir)("dataset privado de importación (LEX-4.10)", () => {
  it("los 10 TXT parsean, suman 1016 filas válidas y no se modifican", () => {
    const root = dir!;
    const names = readdirSync(root)
      .filter((name) => name.endsWith(".txt"))
      .sort();
    expect(names).toHaveLength(10);

    const hashesBefore = new Map<string, string>();
    const parser = createPapaParseDelimitedFileParser();
    const beforeMem = process.memoryUsage().heapUsed;
    const started = performance.now();

    let valid = 0;
    let issues = 0;
    const keys: string[] = [];

    for (const name of names) {
      const full = join(root, name);
      const buffer = readFileSync(full);
      hashesBefore.set(name, createHash("sha256").update(buffer).digest("hex"));
      const content = buffer.toString("utf8");
      const inspected = inspectImportUpload({
        filename: name,
        byteSize: buffer.length,
        content,
      });
      expect(inspected.ok, `${name} rechazado por tamaño o filas`).toBe(true);
      const parsed = parser.parse(content);
      expect(parsed.separator).toBe("tab");
      expect(parsed.separatorFromDirective).toBe(true);
      expect(parsed.columnCount).toBe(3);
      expect(parsed.issues, `${name} tenía filas inválidas`).toHaveLength(0);
      valid += parsed.rows.length;
      issues += parsed.issues.length;
      for (const row of parsed.rows) {
        keys.push(canonicalKey(row.front));
      }
    }

    const elapsedMs = performance.now() - started;
    const heapDelta = process.memoryUsage().heapUsed - beforeMem;

    expect(valid).toBe(1016);
    expect(issues).toBe(0);
    expect(new Set(keys).size).toBe(1013);

    for (const name of names) {
      const after = createHash("sha256")
        .update(readFileSync(join(root, name)))
        .digest("hex");
      expect(after, `${name} cambió en disco`).toBe(hashesBefore.get(name));
      expect(statSync(join(root, name)).isFile()).toBe(true);
    }

    // eslint-disable-next-line no-console -- evidencia de rendimiento, sin contenido
    console.log(
      JSON.stringify({
        files: names.length,
        valid,
        uniqueKeys: new Set(keys).size,
        elapsedMs: Math.round(elapsedMs),
        heapDeltaBytes: heapDelta,
      }),
    );
  });
});
