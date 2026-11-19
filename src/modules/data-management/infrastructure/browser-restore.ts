import {
  RESTORE_CHUNK_CHARS,
  RestoreError,
  restoreResponseSchema,
  type RestoreRequest,
} from "../application/restore-backup";
import type { PreparedBackup } from "./portable-backup";

export async function requestRestore(data: RestoreRequest, signal: AbortSignal) {
  try {
    const response = await fetch("/api/account/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      body: JSON.stringify(data),
      signal,
    });
    const result = restoreResponseSchema.safeParse(await response.json());
    if (!result.success) throw new RestoreError("unavailable");
    if (!result.data.ok) throw new RestoreError(result.data.error);
    return result.data.progress;
  } catch (error) {
    if (error instanceof RestoreError) throw error;
    throw new RestoreError("unavailable");
  }
}

export async function restorePreparedBackup(
  id: string,
  backup: PreparedBackup,
  signal: AbortSignal,
  onProgress: (percent: number) => void,
) {
  const parts: string[] = [];
  for (let start = 0; start < backup.payloadText.length;) {
    let end = Math.min(start + RESTORE_CHUNK_CHARS, backup.payloadText.length);
    if (end < backup.payloadText.length && /[\uD800-\uDBFF]/.test(backup.payloadText[end - 1]!))
      end--;
    parts.push(backup.payloadText.slice(start, end));
    start = end;
  }
  const begin = await requestRestore(
    { action: "begin", id, bytes: backup.bytes, sha256: backup.sha256 },
    signal,
  );
  if (begin.state === "restored") return begin;
  if (begin.state !== "uploading" || begin.next > parts.length) throw new RestoreError("conflict");
  for (let index = begin.next; index < parts.length; index++) {
    onProgress(Math.floor((index / parts.length) * 100));
    const part = await requestRestore({ action: "append", id, index, text: parts[index]! }, signal);
    if (part.state === "restored") return part;
    if (part.state !== "uploading" || part.next !== index + 1) throw new RestoreError("conflict");
  }
  onProgress(100);
  const result = await requestRestore({ action: "commit", id, confirmation: "RESTORE" }, signal);
  if (result.state !== "restored") throw new RestoreError("conflict");
  return result;
}
