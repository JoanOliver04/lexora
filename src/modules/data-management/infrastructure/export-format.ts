import "server-only";
import { createHash } from "node:crypto";
import Papa from "papaparse";
import packageMetadata from "../../../../package.json";
import { DataExportError } from "../application/export-data";
import {
  EXPORT_ENTITIES,
  MAX_ARTIFACT_BYTES,
  MAX_EXPORT_BYTES,
  type ExportFormat,
  type ExportSnapshot,
  type ExportValue,
} from "../domain/data-export";
import { parseExportPayload } from "./lossless-export-json";

const CSV_COLUMNS = [
  "entity",
  "id",
  "course_id",
  "concept_id",
  "practice_item_id",
  "deck_id",
  "title",
  "kind",
  "mode",
  "summary",
  "prompt_text",
  "answer_text",
  "example_text",
  "explanation_text",
  "phase",
  "rating",
  "reviewed_at",
  "due_at",
  "raw_json",
] as const;
/** Formula escaping is separate from CSV quoting. Preserve all other literal text. */
export function safeSpreadsheetCell(value: string): string {
  return /^[\p{White_Space}\p{Cf}\u0000-\u001f\u007f]*[=+\-@]/u.test(value) ||
    /^[\t\r\n]/.test(value)
    ? `'${value}`
    : value;
}
function canonicalRow(row: Record<string, ExportValue>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "string" &&
      (key.endsWith("_at") || key === "due_before" || key === "due_after") &&
      /^\d{4}-\d{2}-\d{2}T/.test(value)
        ? value.replace(/\+00:00$/, "Z")
        : value,
    ]),
  );
}
function csvLine(values: string[]) {
  return (
    Papa.unparse([values.map(safeSpreadsheetCell)], { quotes: true, newline: "\r\n" }) + "\r\n"
  );
}
export function formatDataExport(snapshot: ExportSnapshot, format: ExportFormat) {
  const original = parseExportPayload(snapshot);
  const payload = Object.fromEntries(
    EXPORT_ENTITIES.map((entity) => [entity, original[entity].map(canonicalRow)]),
  );
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized, "utf8") > MAX_EXPORT_BYTES)
    throw new DataExportError("too-large");
  const payloadSha256 = createHash("sha256").update(serialized).digest("hex");
  const header = {
    format: "lexora-account-export",
    formatVersion: 1,
    schemaVersion: 1,
    appVersion: packageMetadata.version,
    exportedAtUtc: snapshot.exportedAt,
    payloadSha256,
  };
  function* chunks(): Generator<string> {
    if (format === "json") {
      yield JSON.stringify(header).slice(0, -1) + ',"payload":';
      yield serialized;
      yield "}";
      return;
    }
    yield "\uFEFF";
    yield csvLine([...CSV_COLUMNS]);
    for (const entity of EXPORT_ENTITIES)
      for (const row of payload[entity]!) {
        yield csvLine(
          CSV_COLUMNS.map((key) => {
            if (key === "entity") return entity;
            if (key === "raw_json") return JSON.stringify(row);
            const value = row[key];
            return value === null || value === undefined
              ? ""
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);
          }),
        );
      }
  }
  function* boundedChunks(): Generator<string> {
    for (const chunk of chunks())
      for (let start = 0; start < chunk.length;) {
        let end = Math.min(start + 65536, chunk.length);
        // Bound CSV rows too, and never split a surrogate pair during encoding.
        if (end < chunk.length && /[\uD800-\uDBFF]/.test(chunk[end - 1]!)) end--;
        yield chunk.slice(start, end);
        start = end;
      }
  }
  let bytes = 0;
  const hash = createHash("sha256");
  for (const chunk of boundedChunks()) {
    bytes += Buffer.byteLength(chunk, "utf8");
    if (bytes > MAX_ARTIFACT_BYTES) throw new DataExportError("too-large");
    hash.update(chunk);
  }
  return {
    chunks: boundedChunks,
    bytes,
    sha256: hash.digest("hex"),
    fileName: `lexora-${snapshot.exportedAt.slice(0, 10)}.${format}`,
    contentType: format === "json" ? "application/json; charset=utf-8" : "text/csv; charset=utf-8",
  };
}
