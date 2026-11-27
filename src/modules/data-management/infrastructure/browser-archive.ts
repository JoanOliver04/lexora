import {
  ARCHIVE_ALL_AUDIO_BYTES,
  ARCHIVE_AUDIO_BYTES,
  ARCHIVE_PART,
  archiveCounts,
  archiveIndexSchema,
  archiveProgressSchema,
  audioMimeSchema,
  blobHash,
  packArchive,
  validatePage,
  type ArchiveAudio,
  type ArchiveManifest,
  type ArchiveRequest,
  type PreparedArchive,
} from "../application/account-archive";
import { RestoreError, type RestoreFailure } from "../application/restore-error";
import type { BrowserExportResult } from "./browser-export";
import { recoverArchiveMedia, requestMediaRecovery } from "./browser-archive-maintenance";

const errors: Record<number, RestoreFailure> = {
  400: "invalid",
  401: "reauthenticate",
  403: "wrongAccount",
  409: "conflict",
  413: "tooLarge",
  422: "integrity",
  429: "cooldown",
};
async function checked(response: Response) {
  if (!response.ok) throw new RestoreError(errors[response.status] ?? "unavailable");
  return response;
}
async function request(input: ArchiveRequest, signal: AbortSignal): Promise<unknown> {
  const response = await checked(
    await fetch("/api/account/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal,
      body: JSON.stringify(input),
    }),
  );
  return response.json();
}
function audioUrl(ref: { course: string; hash: string }) {
  return (
    "/api/account/archive/audio?" + new URLSearchParams({ course: ref.course, hash: ref.hash })
  );
}
function decodeBase64(text: unknown) {
  if (typeof text !== "string" || text.length > 357000) throw new RestoreError("integrity");
  return Uint8Array.from(atob(text), (value) => value.charCodeAt(0)).buffer;
}
async function encodeBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let result = "";
  for (let start = 0; start < bytes.length; start += 8192)
    result += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(result);
}
export async function downloadArchive(
  signal: AbortSignal,
  progress: (n: number) => void,
): Promise<BrowserExportResult> {
  try {
    const index = archiveIndexSchema.parse(await request({ action: "start" }, signal));
    const manifest: ArchiveManifest = { ...index, audio: [] };
    archiveCounts(manifest);
    const pages: Blob[] = [],
      recordings: Blob[] = [];
    const refs = new Map<string, { course: string; hash: string }>();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    for (const [i, page] of manifest.pages.entries()) {
      const parts: ArrayBuffer[] = [];
      for (let offset = 0; offset < page.bytes; offset += ARCHIVE_PART) {
        const result = await request(
          { action: "page", entity: page.entity, after: page.after, rows: page.rows, offset },
          signal,
        );
        const bytes = decodeBase64(result);
        if (bytes.byteLength !== Math.min(page.bytes - offset, ARCHIVE_PART))
          throw new RestoreError("integrity");
        parts.push(bytes);
      }
      const blob = new Blob(parts);
      if ((await blobHash(blob)) !== page.sha256) throw new RestoreError("integrity");
      validatePage(decoder.decode(await blob.arrayBuffer()), page, index.owner, refs);
      pages.push(blob);
      progress(Math.floor((80 * (i + 1)) / manifest.pages.length));
    }
    if (refs.size > 1024) throw new RestoreError("tooLarge");
    let bytes = 0;
    for (const ref of refs.values()) {
      const response = await checked(
        await fetch(audioUrl(ref), { cache: "no-store", credentials: "same-origin", signal }),
      );
      const blob = await response.blob();
      const type = audioMimeSchema.safeParse(blob.type.split(";")[0]);
      if (
        !type.success ||
        blob.size < 1 ||
        blob.size > ARCHIVE_AUDIO_BYTES ||
        (await blobHash(blob)) !== ref.hash
      )
        throw new RestoreError("integrity");
      bytes += blob.size;
      if (bytes > ARCHIVE_ALL_AUDIO_BYTES) throw new RestoreError("tooLarge");
      manifest.audio.push({ ...ref, bytes: blob.size, type: type.data });
      recordings.push(blob);
      progress(80 + Math.floor((19 * recordings.length) / refs.size));
    }
    const file = await packArchive(manifest, pages, recordings);
    signal.throwIfAborted();
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "lexora-account.lexora";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    progress(100);
    return { ok: true };
  } catch (e) {
    if (signal.aborted) return { ok: false, error: "interrupted" };
    const kind = e instanceof RestoreError ? e.kind : "unavailable";
    return {
      ok: false,
      error:
        kind === "cooldown"
          ? "cooldown"
          : kind === "tooLarge"
            ? "too-large"
            : kind === "integrity" || kind === "conflict"
              ? "integrity"
              : kind === "wrongAccount" || kind === "reauthenticate"
                ? "unauthenticated"
                : "unavailable",
    };
  }
}
async function uploadAudio(id: string, ref: ArchiveAudio, body: Blob, signal: AbortSignal) {
  await checked(
    await fetch(audioUrl(ref), {
      method: "PUT",
      body,
      headers: { "Content-Type": ref.type, "X-Lexora-Restore": id },
      credentials: "same-origin",
      cache: "no-store",
      signal,
    }),
  );
}
export async function cancelArchive(id: string, signal: AbortSignal) {
  const result = archiveProgressSchema.parse(await request({ action: "cancel", id }, signal));
  await recoverArchiveMedia(signal);
  requestMediaRecovery();
  return result;
}
export async function restoreArchive(
  id: string,
  archive: PreparedArchive,
  signal: AbortSignal,
  onProgress: (n: number) => void,
) {
  await recoverArchiveMedia(signal);
  const begin = archiveProgressSchema.parse(
    await request({ action: "begin", id, manifest: archive.manifest }, signal),
  );
  if (begin.state === "restored") return begin;
  const parts = archive.pages.reduce((n, p) => n + Math.ceil(p.size / ARCHIVE_PART), 0);
  if (begin.state !== "uploading" || begin.next > parts) throw new RestoreError("conflict");
  const steps = parts + archive.audio.length;
  let sequence = 0;
  for (const [page, blob] of archive.pages.entries()) {
    for (let offset = 0; offset < blob.size; offset += ARCHIVE_PART) {
      if (sequence >= begin.next) {
        const body = await encodeBase64(blob.slice(offset, offset + ARCHIVE_PART));
        const result = archiveProgressSchema.parse(
          await request(
            { action: "append", id, page, part: offset / ARCHIVE_PART, sequence, body },
            signal,
          ),
        );
        if (result.state === "restored") return result;
        if (result.state !== "uploading" || result.next !== sequence + 1)
          throw new RestoreError("conflict");
      }
      onProgress(Math.floor((99 * ++sequence) / steps));
    }
  }
  for (const [i, ref] of archive.manifest.audio.entries()) {
    await uploadAudio(id, ref, archive.audio[i]!, signal);
    onProgress(Math.floor((99 * (parts + i + 1)) / steps));
  }
  onProgress(100);
  const result = archiveProgressSchema.parse(
    await request({ action: "commit", id, confirmation: "RESTORE" }, signal),
  );
  if (result.state !== "restored") throw new RestoreError("conflict");
  requestMediaRecovery();
  return result;
}
