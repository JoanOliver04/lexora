import type { SupabaseClient } from "@supabase/supabase-js";

import { libraryErrorFrom } from "@/modules/library/application/library-error";
import type { Database, Json } from "@/shared/infrastructure/supabase/database.types";

import {
  type ImportJob,
  type ImportJobRepository,
  type ImportJobStatus,
} from "@/modules/importing/application/import-job";

/**
 * Adaptador de `ImportJobRepository` sobre Supabase (LEX-4.7).
 *
 * El cliente llega con la cookie de sesión: RLS de LEX-4.3 es la segunda
 * barrera. `owner_id` se escribe explícito. Sin columna de contenido.
 */

type JobRow = Database["public"]["Tables"]["import_jobs"]["Row"];

function toJob(row: JobRow): ImportJob {
  return {
    id: row.id,
    courseId: row.course_id,
    ownerId: row.owner_id,
    deckId: row.deck_id,
    originalFilename: row.original_filename,
    contentHash: row.content_hash,
    status: row.status as ImportJobStatus,
    rowsTotal: row.rows_total,
    rowsCreated: row.rows_created,
    rowsSkipped: row.rows_skipped,
    rowsDuplicate: row.rows_duplicate,
    rowsFailed: row.rows_failed,
  };
}

export function createSupabaseImportJobRepository(
  client: SupabaseClient<Database>,
): ImportJobRepository {
  return {
    async create({ ownerId, courseId, deckId, originalFilename, contentHash, mappingConfig }) {
      const { data, error } = await client
        .from("import_jobs")
        .insert({
          owner_id: ownerId,
          course_id: courseId,
          deck_id: deckId,
          original_filename: originalFilename,
          content_hash: contentHash,
          mapping_config: mappingConfig as Json,
          status: "importing",
        })
        .select("*")
        .single();
      if (error || !data) {
        throw libraryErrorFrom(error, "no se pudo crear el trabajo de importación");
      }
      return toJob(data);
    },

    async complete({
      ownerId,
      jobId,
      rowsTotal,
      rowsCreated,
      rowsSkipped,
      rowsDuplicate,
      rowsFailed,
    }) {
      const { data, error } = await client
        .from("import_jobs")
        .update({
          status: "completed",
          rows_total: rowsTotal,
          rows_created: rowsCreated,
          rows_skipped: rowsSkipped,
          rows_duplicate: rowsDuplicate,
          rows_failed: rowsFailed,
        })
        .eq("id", jobId)
        .eq("owner_id", ownerId)
        .select("*")
        .single();
      if (error || !data) {
        throw libraryErrorFrom(error, "no se pudo completar el trabajo de importación");
      }
      return toJob(data);
    },

    async fail({ ownerId, jobId }) {
      const { error } = await client
        .from("import_jobs")
        .update({ status: "failed" })
        .eq("id", jobId)
        .eq("owner_id", ownerId);
      if (error) {
        throw libraryErrorFrom(error, "no se pudo marcar el trabajo como fallido");
      }
    },

    async addError({ ownerId, jobId, rowNumber, code, message, rowSample }) {
      const { error } = await client.from("import_job_errors").insert({
        owner_id: ownerId,
        import_job_id: jobId,
        row_number: rowNumber,
        code,
        message,
        row_sample: rowSample,
      });
      if (error) {
        throw libraryErrorFrom(error, "no se pudo registrar un error de importación");
      }
    },
  };
}
