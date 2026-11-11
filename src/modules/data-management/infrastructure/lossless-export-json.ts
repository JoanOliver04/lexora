import "server-only";
import { DataExportError } from "../application/export-data";
import {
  EXPORT_ENTITIES,
  MAX_EXPORT_BYTES,
  type ExportPayload,
  type ExportSnapshot,
} from "../domain/data-export";

// Node 24 supports the JSON source/raw primitives; current TS libs do not yet
// describe them. Never fall back to Number and silently alter stored JSONB.
interface SourceJson {
  parse(
    text: string,
    reviver: (key: string, value: unknown, context?: { source?: string }) => unknown,
  ): unknown;
  rawJSON(source: string): unknown;
  isRawJSON(value: unknown): boolean;
}
const sourceJson = JSON as unknown as SourceJson;
export function parseExportPayload(snapshot: ExportSnapshot): ExportPayload {
  if (Buffer.byteLength(snapshot.payloadText, "utf8") > MAX_EXPORT_BYTES)
    throw new DataExportError("too-large");
  if (typeof sourceJson.rawJSON !== "function" || typeof sourceJson.isRawJSON !== "function")
    throw new DataExportError("unavailable");
  let payload: unknown;
  try {
    payload = sourceJson.parse(snapshot.payloadText, (_key, value, context) => {
      if (typeof value !== "number") return value;
      if (!context?.source) throw new DataExportError("unavailable");
      return sourceJson.rawJSON(context.source);
    });
  } catch {
    throw new DataExportError("unavailable");
  }
  const record = (value: unknown): value is Record<string, unknown> =>
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !sourceJson.isRawJSON(value);
  if (!record(payload) || Object.keys(payload).length !== EXPORT_ENTITIES.length)
    throw new DataExportError("unavailable");
  let total = 0;
  for (const entity of EXPORT_ENTITIES) {
    const rows = payload[entity];
    if (
      !Object.hasOwn(payload, entity) ||
      !Array.isArray(rows) ||
      rows.length > 50000 ||
      rows.some((row) => !record(row))
    )
      throw new DataExportError("unavailable");
    total += rows.length;
  }
  if (total !== snapshot.rows || total > 50000) throw new DataExportError("unavailable");
  // Do not clone opaque records with Zod: it strips literal __proto__ keys and
  // would also turn native RawJSON markers back into ordinary objects.
  return payload as ExportPayload;
}
