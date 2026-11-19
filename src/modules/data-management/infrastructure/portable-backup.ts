import Papa from "papaparse";
import { z } from "zod";
import {
  BACKUP_CSV_COLUMNS,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  BACKUP_SCHEMA_VERSION,
  EXPORT_ENTITIES,
  MAX_ARTIFACT_BYTES,
  MAX_EXPORT_BYTES,
  type ExportEntity,
} from "../domain/data-export";
import { RestoreError, restoreSha256Schema } from "../application/restore-backup";

const headerSchema = z
  .object({
    format: z.literal(BACKUP_FORMAT),
    formatVersion: z.number().int().positive(),
    schemaVersion: z.number().int().positive(),
    appVersion: z.string().min(1).max(80),
    exportedAtUtc: z.iso.datetime(),
    payloadSha256: restoreSha256Schema,
  })
  .strict();

export interface PreparedBackup {
  payloadText: string;
  bytes: number;
  sha256: string;
  exportedAtUtc: string;
  counts: Record<ExportEntity, number>;
}

function jsonParts(text: string): { header: unknown; payloadText: string } {
  // Exports place the payload last. Keep the original bytes for checksum and
  // for PostgreSQL's lossless JSONB parser, even on older browsers.
  const marker = ',"payload":';
  const index = text.indexOf(marker);
  if (index < 0 || !text.endsWith("}")) throw new RestoreError("invalid");
  return {
    header: JSON.parse(text.slice(0, index) + "}"),
    payloadText: text.slice(index + marker.length, -1),
  };
}

function csvParts(text: string): { header: unknown; payloadText: string } {
  const records = new Map<string, string[]>(EXPORT_ENTITIES.map((name) => [name, []]));
  let header: unknown;
  let line = 0;
  let failed = false;
  Papa.parse<string[]>(text, {
    delimiter: ",",
    skipEmptyLines: true,
    step({ data, errors }, parser) {
      line++;
      if (errors.length || data.length !== BACKUP_CSV_COLUMNS.length || line > 50002) {
        failed = true;
        parser.abort();
        return;
      }
      if (line === 1) {
        if (BACKUP_CSV_COLUMNS.some((column, index) => data[index] !== column)) {
          failed = true;
          parser.abort();
        }
        return;
      }
      const name = data[0]!;
      const value = data.at(-1)!;
      if (header !== undefined || !value.startsWith("{") || !value.endsWith("}")) {
        failed = true;
        parser.abort();
        return;
      }
      if (name === BACKUP_FORMAT) {
        header = JSON.parse(value);
      } else {
        const rows = records.get(name);
        if (rows) rows.push(value);
        else {
          failed = true;
          parser.abort();
        }
      }
    },
  });
  if (failed || header === undefined) throw new RestoreError("invalid");
  return {
    header,
    payloadText:
      "{" +
      EXPORT_ENTITIES.map(
        (entity) => JSON.stringify(entity) + ":[" + records.get(entity)!.join(",") + "]",
      ).join(",") +
      "}",
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export async function prepareBackup(file: Blob, ownerId: string): Promise<PreparedBackup> {
  if (file.size > MAX_ARTIFACT_BYTES) throw new RestoreError("tooLarge");
  let header: unknown;
  let payloadText: string;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()).trim();
    ({ header, payloadText } = text.startsWith("{") ? jsonParts(text) : csvParts(text));
  } catch (error) {
    if (error instanceof RestoreError) throw error;
    throw new RestoreError("invalid");
  }
  const version = headerSchema.safeParse(header);
  if (!version.success) throw new RestoreError("invalid");
  const metadata = version.data;
  if (
    metadata.formatVersion !== BACKUP_FORMAT_VERSION ||
    metadata.schemaVersion !== BACKUP_SCHEMA_VERSION
  )
    throw new RestoreError("version");
  const bytes = new TextEncoder().encode(payloadText);
  if (bytes.length > MAX_EXPORT_BYTES) throw new RestoreError("tooLarge");
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (part) =>
    part.toString(16).padStart(2, "0"),
  ).join("");
  if (sha256 !== metadata.payloadSha256) throw new RestoreError("integrity");
  let payload: unknown;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    throw new RestoreError("invalid");
  }
  if (!isRecord(payload) || Object.keys(payload).length !== EXPORT_ENTITIES.length)
    throw new RestoreError("invalid");
  let total = 0;
  const counts = Object.fromEntries(
    EXPORT_ENTITIES.map((entity) => {
      const rows = Object.hasOwn(payload, entity) ? payload[entity] : undefined;
      if (!Array.isArray(rows) || rows.length > 50000 || !rows.every(isRecord))
        throw new RestoreError("invalid");
      total += rows.length;
      if (entity === "profiles" && (rows.length !== 1 || rows[0]?.["id"] !== ownerId))
        throw new RestoreError("wrongAccount");
      if (
        entity !== "profiles" &&
        entity !== "languages" &&
        rows.some((row) => row[entity === "course_settings" ? "user_id" : "owner_id"] !== ownerId)
      )
        throw new RestoreError("wrongAccount");
      return [entity, rows.length];
    }),
  ) as Record<ExportEntity, number>;
  if (total > 50000) throw new RestoreError("tooLarge");
  return {
    payloadText,
    bytes: bytes.length,
    sha256,
    exportedAtUtc: metadata.exportedAtUtc,
    counts,
  };
}
