import {
  ImportTransferError,
  type ImportDescriptor,
  type ImportProgress,
  type ImportTransferPort,
  type ImportTransferRecord,
  type ImportTransferRequest,
} from "./import-transfer";
import { nextImportBatch } from "./prepare-browser-import";

export async function requestImportJob(
  transfer: ImportTransferPort,
  request: ImportTransferRequest,
  signal?: AbortSignal,
): Promise<ImportProgress> {
  signal?.throwIfAborted();
  const response = await transfer(request, signal);
  signal?.throwIfAborted();
  if (!response.ok) throw new ImportTransferError(response.error);
  if (!("job" in response)) throw new ImportTransferError("unavailable");
  return response.job;
}

export function descriptorMatches(job: ImportProgress, descriptor: ImportDescriptor): boolean {
  const m = job.mapping,
    d = descriptor.mapping;
  return (
    job.courseId === descriptor.courseId &&
    job.deckId === descriptor.deckId &&
    job.filename === descriptor.filename &&
    job.fileHash === descriptor.fileHash &&
    job.rowsTotal === descriptor.rowsTotal &&
    m.front === d.front &&
    m.back === d.back &&
    m.tags === d.tags &&
    m.strategy === d.strategy &&
    m.createReverse === d.createReverse &&
    m.originalBytes === d.originalBytes
  );
}

/** A lost acknowledgement stops the loop. Resume always reads persisted progress first. */
export async function runBrowserImport(input: {
  descriptor: ImportDescriptor;
  records: ImportTransferRecord[];
  locale: "es" | "en";
  resumeJobId?: string;
  transfer: ImportTransferPort;
  signal: AbortSignal;
  onProgress: (job: ImportProgress) => void;
}): Promise<ImportProgress> {
  let job = await requestImportJob(
    input.transfer,
    input.resumeJobId
      ? { action: "status", jobId: input.resumeJobId }
      : { ...input.descriptor, action: "begin" },
    input.signal,
  );
  if (!descriptorMatches(job, input.descriptor)) throw new ImportTransferError("conflict");
  input.onProgress(job);
  if (job.status === "failed") throw new ImportTransferError("conflict");
  while (job.processedRows < input.records.length) {
    input.signal.throwIfAborted();
    const batch = nextImportBatch(input.records, job.processedRows, input.locale);
    const previous = job.processedRows;
    const next = await requestImportJob(
      input.transfer,
      {
        action: "append",
        jobId: job.id,
        offset: previous,
        records: batch,
        locale: input.locale,
      },
      input.signal,
    );
    if (
      next.id !== job.id ||
      !descriptorMatches(next, input.descriptor) ||
      next.processedRows !== previous + batch.length ||
      next.status === "failed"
    )
      throw new ImportTransferError("unavailable");
    job = next;
    input.onProgress(job);
  }
  if (job.status !== "completed") throw new ImportTransferError("unavailable");
  return job;
}
