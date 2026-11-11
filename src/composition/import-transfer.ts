import "server-only";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
import { createSupabaseImportTransferRepository } from "@/modules/importing/infrastructure/supabase-import-transfer-repository";
import {
  transferImport,
  ImportTransferError,
  type ImportTransferResponse,
} from "@/modules/importing/application/import-transfer";
async function context(signal?: AbortSignal) {
  const budget = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(12000)])
    : AbortSignal.timeout(12000);
  const client = await createSupabaseServerClient(budget);
  const { data, error } = await client.auth.getClaims();
  return error || !data?.claims.sub
    ? null
    : createSupabaseImportTransferRepository(client, data.claims.sub, budget);
}
export async function transferImportForCurrentUser(
  input: unknown,
  signal: AbortSignal,
): Promise<ImportTransferResponse> {
  try {
    const repository = await context(signal);
    return repository ? transferImport(repository, input) : { ok: false, error: "unauthenticated" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
export async function pendingImportForCurrentUser(courseId: string, jobId?: string) {
  const repository = await context();
  if (!repository) return null;
  if (jobId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    try {
      const job = await repository.status(jobId);
      if (job.courseId === courseId) return job;
    } catch (error) {
      if (!(error instanceof ImportTransferError) || error.kind !== "not-found") throw error;
    }
  }
  return repository.pending(courseId);
}
