import { z } from "zod";
import { EXPORT_ENTITIES, type ExportEntity } from "../domain/data-export";
import { RestoreError } from "./restore-error";

export const ARCHIVE_PART = 262144;
export const ARCHIVE_AUDIO_BYTES = 4 * 1024 * 1024;
export const ARCHIVE_DATA_BYTES = 64 * 1024 * 1024;
export const ARCHIVE_ALL_AUDIO_BYTES = 128 * 1024 * 1024;
export const ARCHIVE_HEADER_BYTES = 2 * 1024 * 1024;
export const ARCHIVE_MAGIC = "LEXORA1\n";
const headerSize = ARCHIVE_MAGIC.length + 8 + 1 + 64 + 1;
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const audioMimeSchema = z.enum([
  "audio/mpeg",
  "audio/ogg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
]);
export const archivePageSchema = z.strictObject({
  entity: z.enum(EXPORT_ENTITIES),
  after: z.array(z.uuid()).min(1).max(2).nullable(),
  rows: z.number().int().min(1).max(256),
  bytes: z.number().int().min(1).max(8388608),
  sha256: hash,
});
export const archiveAudioSchema = z.strictObject({
  course: z.uuid(),
  hash,
  bytes: z.number().int().min(1).max(ARCHIVE_AUDIO_BYTES),
  type: audioMimeSchema,
});
export const archiveIndexSchema = z.strictObject({
  format: z.literal("lexora-account-archive/1"),
  owner: z.uuid(),
  exportedAtUtc: z.iso.datetime(),
  pages: z.array(archivePageSchema).min(1).max(4096),
});
export const archiveManifestSchema = archiveIndexSchema.extend({
  audio: z.array(archiveAudioSchema).max(1024),
});
export type ArchivePage = z.infer<typeof archivePageSchema>;
export type ArchiveAudio = z.infer<typeof archiveAudioSchema>;
export type ArchiveManifest = z.infer<typeof archiveManifestSchema>;
export const archiveRequestSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("start") }),
  z.strictObject({ action: z.literal("cleanup") }),
  z.strictObject({
    action: z.literal("page"),
    entity: archivePageSchema.shape.entity,
    after: archivePageSchema.shape.after,
    rows: archivePageSchema.shape.rows,
    offset: z.number().int().min(0).max(8388607),
  }),
  z.strictObject({ action: z.literal("begin"), id: z.uuid(), manifest: archiveManifestSchema }),
  z.strictObject({
    action: z.literal("append"),
    id: z.uuid(),
    page: z.number().int().min(0).max(4095),
    part: z.number().int().min(0).max(31),
    sequence: z.number().int().min(0).max(8191),
    body: z.string().min(4).max(349528),
  }),
  z.strictObject({ action: z.literal("commit"), id: z.uuid(), confirmation: z.literal("RESTORE") }),
  z.strictObject({ action: z.literal("cancel"), id: z.uuid() }),
]);
export type ArchiveRequest = z.infer<typeof archiveRequestSchema>;
export const archiveProgressSchema = z.strictObject({
  state: z.enum(["uploading", "restored", "cancelled"]),
  next: z.number().int().min(0).max(8192),
  rows: z.number().int().min(0).max(200000),
});

export interface PreparedArchive {
  manifestHash: string;
  manifest: ArchiveManifest;
  pages: Blob[];
  audio: Blob[];
  counts: Record<ExportEntity, number>;
  exportedAtUtc: string;
}

export async function blobHash(blob: Blob) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer())),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

const decoder = new TextDecoder("utf-8", { fatal: true });
export function archiveCounts(manifest: ArchiveManifest) {
  const counts = Object.fromEntries(EXPORT_ENTITIES.map((entity) => [entity, 0])) as Record<
    ExportEntity,
    number
  >;
  let bytes = 0,
    rows = 0;
  for (const page of manifest.pages) {
    counts[page.entity] += page.rows;
    rows += page.rows;
    bytes += page.bytes;
  }
  if (
    rows > 200000 ||
    bytes > ARCHIVE_DATA_BYTES ||
    manifest.audio.reduce((n, a) => n + a.bytes, 0) > ARCHIVE_ALL_AUDIO_BYTES
  )
    throw new RestoreError("tooLarge");
  if (counts.profiles !== 1) throw new RestoreError("invalid");
  return counts;
}

export function validatePage(
  text: string,
  page: ArchivePage,
  owner: string,
  refs: Map<string, { course: string; hash: string }>,
) {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data) || data.length !== page.rows) throw new RestoreError("invalid");
  for (const row of data) {
    if (row === null || typeof row !== "object" || Array.isArray(row))
      throw new RestoreError("invalid");
    if (
      page.entity !== "languages" &&
      row[
        page.entity === "profiles"
          ? "id"
          : page.entity === "course_settings"
            ? "user_id"
            : "owner_id"
      ] !== owner
    )
      throw new RestoreError("wrongAccount");
    if (page.entity !== "courses" || row.eoi_sources == null) continue;
    if (
      !z.uuid().safeParse(row.id).success ||
      typeof row.eoi_sources !== "object" ||
      Array.isArray(row.eoi_sources)
    )
      throw new RestoreError("invalid");
    for (const source of Object.values(row.eoi_sources)) {
      if (typeof source !== "object" || source === null || !("audio" in source)) continue;
      if (!("hash" in source) || !hash.safeParse(source.hash).success)
        throw new RestoreError("invalid");
      const audioHash = String(source.hash);
      refs.set(row.id + "/" + audioHash, { course: row.id, hash: audioHash });
    }
  }
}
export async function packArchive(manifest: ArchiveManifest, pages: Blob[], audio: Blob[]) {
  archiveCounts(manifest);
  const header = new Blob([JSON.stringify(manifest)]);
  if (header.size > ARCHIVE_HEADER_BYTES) throw new RestoreError("tooLarge");
  const prefix =
    ARCHIVE_MAGIC +
    header.size.toString(16).padStart(8, "0") +
    "\n" +
    (await blobHash(header)) +
    "\n";
  return new Blob([prefix, header, ...pages, ...audio], { type: "application/octet-stream" });
}
export async function prepareArchive(file: Blob, owner: string): Promise<PreparedArchive> {
  try {
    if (
      file.size >
      headerSize + ARCHIVE_HEADER_BYTES + ARCHIVE_DATA_BYTES + ARCHIVE_ALL_AUDIO_BYTES
    )
      throw new RestoreError("tooLarge");
    const prefix = await file.slice(0, headerSize).text();
    if (!/^LEXORA1\n[0-9a-f]{8}\n[0-9a-f]{64}\n$/.test(prefix)) throw new RestoreError("invalid");
    const [, size, expected] = prefix.split("\n");
    const length = parseInt(size!, 16);
    if (length < 1 || length > ARCHIVE_HEADER_BYTES) throw new RestoreError("invalid");
    const header = file.slice(headerSize, headerSize + length);
    if (header.size !== length || (await blobHash(header)) !== expected)
      throw new RestoreError("integrity");
    const raw: unknown = JSON.parse(decoder.decode(await header.arrayBuffer()));
    const manifest = archiveManifestSchema.parse(raw);
    if (manifest.owner !== owner) throw new RestoreError("wrongAccount");
    const counts = archiveCounts(manifest);
    const pages: Blob[] = [],
      audio: Blob[] = [];
    let offset = headerSize + length;
    const take = async (bytes: number, sha: string, type = "") => {
      const part = file.slice(offset, offset + bytes, type);
      offset += bytes;
      if (part.size !== bytes || (await blobHash(part)) !== sha)
        throw new RestoreError("integrity");
      return part;
    };
    const refs = new Map<string, { course: string; hash: string }>();
    for (const page of manifest.pages) {
      const part = await take(page.bytes, page.sha256);
      validatePage(decoder.decode(await part.arrayBuffer()), page, owner, refs);
      pages.push(part);
    }
    for (const recording of manifest.audio) {
      if (!refs.delete(recording.course + "/" + recording.hash)) throw new RestoreError("invalid");
      audio.push(await take(recording.bytes, recording.hash, recording.type));
    }
    if (refs.size || offset !== file.size) throw new RestoreError("integrity");
    return {
      manifest,
      manifestHash: expected!,
      pages,
      audio,
      counts,
      exportedAtUtc: manifest.exportedAtUtc,
    };
  } catch (e) {
    if (e instanceof RestoreError) throw e;
    throw new RestoreError("invalid");
  }
}
