import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/shared/infrastructure/supabase/database.types";
import {
  IMPORT_ERROR_CODES,
  ImportTransferError,
  importDescriptorSchema,
  type ImportDescriptor,
  type ImportProgress,
  type ImportTransferRepository,
  type ImportPersistenceRecord,
} from "../application/import-transfer";

const integer = z.number().int().min(0).max(10000);
const jobSchema = z.object({
  id: z.uuid(),
  course_id: z.uuid(),
  deck_id: z.uuid().nullable(),
  original_filename: z.string(),
  content_hash: z.string(),
  mapping_config: importDescriptorSchema.shape.mapping,
  status: z.enum(["importing", "completed", "failed"]),
  rows_total: integer.min(1),
  processed_rows: integer,
  rows_created: integer,
  rows_skipped: integer,
  rows_duplicate: integer,
  rows_failed: integer,
  last_source_row: z.number().int().min(0),
  request_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});
function progress(value: unknown): ImportProgress {
  const row = jobSchema.safeParse(value);
  if (!row.success) throw new ImportTransferError("unavailable");
  const v = row.data;
  if (
    v.rows_created + v.rows_skipped + v.rows_failed !== v.processed_rows ||
    v.processed_rows > v.rows_total ||
    v.rows_duplicate > v.rows_created + v.rows_skipped
  )
    throw new ImportTransferError("unavailable");
  return {
    id: v.id,
    courseId: v.course_id,
    deckId: v.deck_id,
    filename: v.original_filename,
    fileHash: v.content_hash,
    mapping: v.mapping_config,
    status: v.status,
    rowsTotal: v.rows_total,
    processedRows: v.processed_rows,
    rowsCreated: v.rows_created,
    rowsSkipped: v.rows_skipped,
    rowsDuplicate: v.rows_duplicate,
    rowsFailed: v.rows_failed,
    lastSourceRow: v.last_source_row,
  };
}
function failed(error: { code?: string } | null): never {
  const code = error?.code;
  throw new ImportTransferError(
    code === "PT429"
      ? "cooldown"
      : code === "PT409" || code === "23505"
        ? "conflict"
        : code === "PT404"
          ? "not-found"
          : code === "28000" || code === "42501"
            ? "unauthenticated"
            : code === "22023" || code === "22P02" || code === "22P05"
              ? "invalid-input"
              : "unavailable",
  );
}
const errorSchema = z.object({
  row_number: z.number().int().positive(),
  code: z.enum(IMPORT_ERROR_CODES),
  message: z.string().max(500),
  row_sample: z.string().max(500).nullable(),
});
const matchesSchema = z
  .array(
    z.object({
      rowNumber: z.number().int().positive(),
      canonicalKey: z.string().max(400),
      existingTitles: z.array(z.string().max(200)).max(3),
    }),
  )
  .max(250);
function recordPayload(records: ImportPersistenceRecord[]): Json[] {
  return records.map((record) =>
    record.kind === "valid"
      ? {
          kind: "valid",
          rowNumber: record.rowNumber,
          front: record.front,
          back: record.back,
          tags: record.tags.map((tag) => ({
            displayName: tag.displayName,
            normalizedName: tag.normalizedName,
          })),
        }
      : {
          kind: "error",
          rowNumber: record.rowNumber,
          code: record.code,
          message: record.message,
          sample: record.sample,
        },
  );
}

export function createSupabaseImportTransferRepository(
  client: SupabaseClient<Database>,
  ownerId: string,
  signal?: AbortSignal,
): ImportTransferRepository {
  const abort = () => signal ?? AbortSignal.timeout(12000);
  const status = async (jobId: string) => {
    const { data, error } = await client
      .from("import_jobs")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", jobId)
      .not("request_fingerprint", "is", null)
      .abortSignal(abort())
      .maybeSingle();
    if (error) failed(error);
    if (!data) throw new ImportTransferError("not-found");
    return progress(data);
  };
  return {
    async pending(courseId) {
      const { data, error } = await client
        .from("import_jobs")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("course_id", courseId)
        .eq("status", "importing")
        .not("request_fingerprint", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .abortSignal(abort())
        .maybeSingle();
      if (error) failed(error);
      return data ? progress(data) : null;
    },
    async begin(descriptor: ImportDescriptor) {
      const { data, error } = await client
        .rpc("begin_import_job", {
          p_id: descriptor.id,
          p_course_id: descriptor.courseId,
          p_deck_id: descriptor.deckId,
          p_filename: descriptor.filename,
          p_file_hash: descriptor.fileHash,
          p_total_rows: descriptor.rowsTotal,
          p_mapping: { ...descriptor.mapping },
        })
        .abortSignal(abort());
      if (error) failed(error);
      return progress(data);
    },
    async append(jobId, offset, records) {
      const { data, error } = await client
        .rpc("commit_import_batch", {
          p_job_id: jobId,
          p_offset: offset,
          p_records: recordPayload(records),
          p_stop: false,
        })
        .abortSignal(abort());
      if (error) failed(error);
      return progress(data);
    },
    async stop(jobId) {
      const { data, error } = await client
        .rpc("commit_import_batch", { p_job_id: jobId, p_offset: 0, p_records: [], p_stop: true })
        .abortSignal(abort());
      if (error) failed(error);
      return progress(data);
    },
    status,
    async errors(jobId, after) {
      await status(jobId);
      const { data, error } = await client
        .from("import_job_errors")
        .select("row_number,code,message,row_sample")
        .eq("owner_id", ownerId)
        .eq("import_job_id", jobId)
        .gt("row_number", after)
        .order("row_number", { ascending: true })
        .order("id", { ascending: true })
        .limit(200)
        .abortSignal(abort());
      if (error) failed(error);
      const parsed = z.array(errorSchema).max(200).safeParse(data);
      if (!parsed.success) throw new ImportTransferError("unavailable");
      return parsed.data.map((row) => ({
        rowNumber: row.row_number,
        code: row.code,
        message: row.message,
        sample: row.row_sample,
      }));
    },
    async duplicates(courseId, rows) {
      const { data, error } = await client
        .rpc("preview_import_duplicates", {
          p_course_id: courseId,
          p_rows: rows.map((row) => ({ ...row })),
        })
        .abortSignal(abort());
      if (error) failed(error);
      const parsed = matchesSchema.safeParse(data);
      if (!parsed.success) throw new ImportTransferError("unavailable");
      return parsed.data;
    },
  };
}
