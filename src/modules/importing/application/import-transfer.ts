import { z } from "zod";
import { sanitizeFilename } from "../domain/filename";
import { MAX_FILE_BYTES, MAX_ROWS, MAX_TAGS_FIELD_LENGTH } from "../domain/limits";
import { sanitizeRowSample } from "../domain/sanitize";
import { validateConceptDraft } from "@/modules/library/domain/concept";
import { validateTagDraft, type TagDraft } from "@/modules/library/domain/tag";
import { importErrorMessage } from "./import-error-message";
import type { ImportPersistErrorCode } from "./import-job";

export const IMPORT_BATCH_ROWS = 250;
export const IMPORT_BATCH_BYTES = 128 * 1024;
export const IMPORT_HTTP_BYTES = 256 * 1024;
export const IMPORT_ERROR_CODES = [
  "too_few_columns",
  "too_many_columns",
  "front_empty",
  "back_empty",
  "front_too_long",
  "back_too_long",
  "tags_too_long",
  "rejected",
] as const;
const text = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => !value.includes("\0") && value.isWellFormed());
const rowNumber = z.number().int().min(1).max(2147483647);
export const transferRecordSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("valid"),
      rowNumber,
      front: text(4000),
      back: text(4000),
      tags: z.array(text(2000)).max(1000),
      sample: text(200).optional(),
    })
    .strict()
    .refine((row) => row.tags.join(" ").length <= MAX_TAGS_FIELD_LENGTH),
  z
    .object({
      kind: z.literal("error"),
      rowNumber,
      code: z.enum(IMPORT_ERROR_CODES),
      sample: z.string().max(200),
    })
    .strict(),
]);
export type ImportTransferRecord = z.infer<typeof transferRecordSchema>;
const uuid = z.uuid();
export const importMappingSchema = z
  .object({
    front: z.number().int().min(0).max(10000),
    back: z.number().int().min(0).max(10000),
    tags: z.number().int().min(0).max(10000).nullable(),
    strategy: z.enum(["skip", "copy"]),
    createReverse: z.boolean(),
    originalBytes: z.number().int().min(1).max(MAX_FILE_BYTES),
  })
  .strict();
export const importDescriptorSchema = z
  .object({
    id: uuid,
    courseId: uuid,
    deckId: uuid,
    filename: text(255).min(1),
    fileHash: z.string().regex(/^[0-9a-f]{64}$/),
    rowsTotal: z.number().int().min(1).max(MAX_ROWS),
    mapping: importMappingSchema,
  })
  .strict();
export type ImportDescriptor = z.infer<typeof importDescriptorSchema>;
export const importTransferSchema = z.discriminatedUnion("action", [
  importDescriptorSchema.extend({ action: z.literal("begin") }),
  z
    .object({
      action: z.literal("append"),
      jobId: uuid,
      offset: z.number().int().min(0).max(MAX_ROWS),
      locale: z.enum(["es", "en"]),
      records: z.array(transferRecordSchema).min(1).max(IMPORT_BATCH_ROWS),
    })
    .strict(),
  z.object({ action: z.literal("status"), jobId: uuid }).strict(),
  z.object({ action: z.literal("stop"), jobId: uuid }).strict(),
  z
    .object({ action: z.literal("errors"), jobId: uuid, after: rowNumber.or(z.literal(0)) })
    .strict(),
  z
    .object({
      action: z.literal("duplicates"),
      courseId: uuid,
      rows: z.array(z.object({ rowNumber, front: text(200) }).strict()).max(IMPORT_BATCH_ROWS),
    })
    .strict(),
]);
export type ImportTransferRequest = z.infer<typeof importTransferSchema>;
export interface ImportProgress {
  id: string;
  courseId: string;
  deckId: string | null;
  filename: string;
  fileHash: string;
  mapping: ImportDescriptor["mapping"];
  status: "importing" | "completed" | "failed";
  rowsTotal: number;
  processedRows: number;
  rowsCreated: number;
  rowsSkipped: number;
  rowsDuplicate: number;
  rowsFailed: number;
  lastSourceRow: number;
}
export interface ImportTransferErrorRow {
  rowNumber: number;
  code: ImportPersistErrorCode;
  message: string;
  sample: string | null;
}
export interface ImportDuplicateMatch {
  rowNumber: number;
  canonicalKey: string;
  existingTitles: string[];
}
export type ImportTransferFailure =
  "unauthenticated" | "not-found" | "invalid-input" | "conflict" | "cooldown" | "unavailable";
export class ImportTransferError extends Error {
  constructor(readonly kind: ImportTransferFailure) {
    super(kind);
    this.name = "ImportTransferError";
  }
}
export interface ImportPersistenceRecordValid {
  kind: "valid";
  rowNumber: number;
  front: string;
  back: string;
  tags: TagDraft[];
}
export interface ImportPersistenceRecordError {
  kind: "error";
  rowNumber: number;
  code: ImportPersistErrorCode;
  message: string;
  sample: string;
}
export type ImportPersistenceRecord = ImportPersistenceRecordValid | ImportPersistenceRecordError;
export interface ImportTransferRepository {
  pending(courseId: string): Promise<ImportProgress | null>;
  begin(descriptor: ImportDescriptor): Promise<ImportProgress>;
  append(
    jobId: string,
    offset: number,
    records: ImportPersistenceRecord[],
  ): Promise<ImportProgress>;
  stop(jobId: string): Promise<ImportProgress>;
  status(jobId: string): Promise<ImportProgress>;
  errors(jobId: string, after: number): Promise<ImportTransferErrorRow[]>;
  duplicates(
    courseId: string,
    rows: { rowNumber: number; front: string }[],
  ): Promise<ImportDuplicateMatch[]>;
}
export type ImportTransferResponse =
  | { ok: true; job: ImportProgress }
  | { ok: true; errors: ImportTransferErrorRow[] }
  | { ok: true; matches: ImportDuplicateMatch[] }
  | { ok: false; error: ImportTransferFailure };

const counter = z.number().int().min(0).max(MAX_ROWS);
export const importProgressSchema = z
  .object({
    id: uuid,
    courseId: uuid,
    deckId: uuid.nullable(),
    filename: text(255),
    fileHash: z.string().regex(/^[0-9a-f]{64}$/),
    mapping: importMappingSchema,
    status: z.enum(["importing", "completed", "failed"]),
    rowsTotal: counter.min(1),
    processedRows: counter,
    rowsCreated: counter,
    rowsSkipped: counter,
    rowsDuplicate: counter,
    rowsFailed: counter,
    lastSourceRow: z.number().int().min(0).max(2147483647),
  })
  .strict()
  .refine(
    (job) =>
      job.rowsCreated + job.rowsSkipped + job.rowsFailed === job.processedRows &&
      job.processedRows <= job.rowsTotal &&
      job.rowsDuplicate <= job.rowsCreated + job.rowsSkipped &&
      (job.status !== "completed" || job.processedRows === job.rowsTotal),
  );
export const importTransferResponseSchema = z.union([
  z.object({ ok: z.literal(true), job: importProgressSchema }).strict(),
  z
    .object({
      ok: z.literal(true),
      errors: z
        .array(
          z
            .object({
              rowNumber,
              code: z.enum(IMPORT_ERROR_CODES),
              message: text(500),
              sample: text(500).nullable(),
            })
            .strict(),
        )
        .max(200),
    })
    .strict(),
  z
    .object({
      ok: z.literal(true),
      matches: z
        .array(
          z
            .object({
              rowNumber,
              canonicalKey: text(400),
              existingTitles: z.array(text(200)).max(3),
            })
            .strict(),
        )
        .max(IMPORT_BATCH_ROWS),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z.enum([
        "unauthenticated",
        "not-found",
        "invalid-input",
        "conflict",
        "cooldown",
        "unavailable",
      ]),
    })
    .strict(),
]);

export type ImportTransferPort = (
  request: ImportTransferRequest,
  signal?: AbortSignal,
) => Promise<ImportTransferResponse>;

/** Validate prepared plain text. HTML conversion happens once at the file boundary. */
export function preparePersistenceRecords(
  records: ImportTransferRecord[],
  locale: string,
): ImportPersistenceRecord[] {
  return records.map((record) => {
    const sample = sanitizeRowSample(
      record.sample ??
        (record.kind === "valid"
          ? [record.front, record.back, record.tags.join(" ")].join(" | ")
          : ""),
    );
    const error = (code: ImportPersistErrorCode): ImportPersistenceRecordError => ({
      kind: "error",
      rowNumber: record.rowNumber,
      code,
      message: importErrorMessage(code, locale),
      sample,
    });
    if (record.kind === "error") return error(record.code);
    const front = record.front,
      back = record.back;
    const validation = validateConceptDraft({
      kind: "vocabulary",
      title: front,
      summary: back,
      explanation: null,
      example: null,
      cefrLevel: null,
      sourceReference: null,
    });
    if (!validation.ok) {
      if (validation.issues.includes("concept.title.empty")) return error("front_empty");
      if (validation.issues.includes("concept.summary.empty")) return error("back_empty");
      if (validation.issues.includes("concept.title.tooLong")) return error("front_too_long");
      if (validation.issues.includes("concept.summary.tooLong")) return error("back_too_long");
      return error("rejected");
    }
    const tags = new Map<string, TagDraft>();
    for (const name of record.tags) {
      const result = validateTagDraft({ name });
      if (result.ok && !tags.has(result.value.normalizedName))
        tags.set(result.value.normalizedName, result.value);
    }
    return {
      kind: "valid",
      rowNumber: record.rowNumber,
      front: validation.value.title,
      back: validation.value.summary,
      tags: [...tags.values()],
    };
  });
}

/** The client charges compact DB payload bytes, leaving room for JSONB spaces. */
export function persistenceRecordBytes(record: ImportTransferRecord, locale: string): number {
  return new TextEncoder().encode(JSON.stringify(preparePersistenceRecords([record], locale)[0]))
    .length;
}

export async function transferImport(
  repository: ImportTransferRepository,
  raw: unknown,
): Promise<ImportTransferResponse> {
  const parsed = importTransferSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid-input" };
  const request = parsed.data;
  try {
    switch (request.action) {
      case "begin":
        return {
          ok: true,
          job: await repository.begin({ ...request, filename: sanitizeFilename(request.filename) }),
        };
      case "append": {
        if (
          request.records.some(
            (record, index) =>
              index > 0 && record.rowNumber <= request.records[index - 1]!.rowNumber,
          )
        )
          return { ok: false, error: "invalid-input" };
        const records = preparePersistenceRecords(request.records, request.locale);
        if (new TextEncoder().encode(JSON.stringify(records)).length > IMPORT_BATCH_BYTES)
          return { ok: false, error: "invalid-input" };
        return { ok: true, job: await repository.append(request.jobId, request.offset, records) };
      }
      case "status":
        return { ok: true, job: await repository.status(request.jobId) };
      case "stop":
        return { ok: true, job: await repository.stop(request.jobId) };
      case "errors":
        return { ok: true, errors: await repository.errors(request.jobId, request.after) };
      case "duplicates":
        return { ok: true, matches: await repository.duplicates(request.courseId, request.rows) };
    }
  } catch (error) {
    return { ok: false, error: error instanceof ImportTransferError ? error.kind : "unavailable" };
  }
}
