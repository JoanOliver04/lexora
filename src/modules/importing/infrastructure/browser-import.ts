import {
  IMPORT_HTTP_BYTES,
  ImportTransferError,
  importTransferResponseSchema,
  type ImportTransferPort,
} from "../application/import-transfer";
import { inspectImportUpload, MAX_FILE_BYTES, MAX_ROWS } from "../application/preview";
import { createPapaParseDelimitedFileParser } from "./papaparse-delimited-file-parser";
import { MAX_IMPORT_COLUMNS } from "../domain/limits";

export const transferBrowserImport: ImportTransferPort = async (request, signal) => {
  const body = JSON.stringify(request);
  if (new TextEncoder().encode(body).length > IMPORT_HTTP_BYTES)
    throw new ImportTransferError("invalid-input");
  const response = await fetch("/api/import/jobs", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.any([AbortSignal.timeout(25000), ...(signal ? [signal] : [])]),
  });
  const stream = response.body?.getReader();
  if (!stream) throw new ImportTransferError("unavailable");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await stream.read();
      if (next.done) break;
      bytes += next.value.length;
      if (bytes > 1024 * 1024) throw new ImportTransferError("unavailable");
      chunks.push(next.value);
    }
  } finally {
    await stream.cancel().catch(() => undefined);
  }
  const all = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(all));
  } catch {
    throw new ImportTransferError("unavailable");
  }
  const parsed = importTransferResponseSchema.safeParse(raw);
  if (!parsed.success || response.ok !== parsed.data.ok)
    throw new ImportTransferError("unavailable");
  return parsed.data;
};

export async function readBrowserImportFile(file: File) {
  if (file.size > MAX_FILE_BYTES) return { ok: false as const, error: "too-large" as const };
  if (!file.size) return { ok: false as const, error: "empty-file" as const };
  try {
    const bytes = await file.arrayBuffer();
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const inspected = inspectImportUpload({ filename: file.name, byteSize: file.size, content });
    // Physical line breaks include directives and quoted multiline fields.
    // The bounded tokenizer below is authoritative for data row count.
    if (!inspected.ok && inspected.error !== "too-many-rows") return inspected;
    const tokenized = createPapaParseDelimitedFileParser().tokenize(content);
    if (tokenized.rawRows.length > MAX_ROWS)
      return { ok: false as const, error: "too-many-rows" as const };
    if (tokenized.columnCount > MAX_IMPORT_COLUMNS)
      return { ok: false as const, error: "too-many-columns" as const };
    if (!tokenized.rawRows.length) return { ok: false as const, error: "empty-file" as const };
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const contentHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return {
      ok: true as const,
      carried: {
        ...tokenized,
        filename: inspected.filename,
        contentHash,
        originalBytes: file.size,
      },
    };
  } catch {
    return { ok: false as const, error: "read-failed" as const };
  }
}

export function yieldImportControl(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
