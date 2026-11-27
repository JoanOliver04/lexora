import "server-only";
import { getAuthenticatedUser } from "./identity";
import { getActiveCourseForCurrentUser } from "./courses";
import { parseEoiPack, sourceContent, type EoiPack } from "@/modules/library/domain/eoi";
import type { Json } from "@/shared/infrastructure/supabase/database.types";
import { z } from "zod";

export async function eoiContext() {
  const [user, course] = await Promise.all([
    getAuthenticatedUser(),
    getActiveCourseForCurrentUser(),
  ]);
  if (!user || !course) throw Error("unauthorized");
  return { client: user.client, owner: user.ownerId, course: course.id };
}
const previewSchema = z.object({
  new: z.number(),
  restored: z.number().default(0),
  linked: z.number(),
  updated: z.number(),
  removed: z.number(),
  variants: z.array(z.object({ front: z.string(), current: z.string(), incoming: z.string() })),
  token: z.string(),
});
export type EoiPreview = z.infer<typeof previewSchema>;
export async function saveEoi(
  expectedCourse: string,
  input: string,
  media: Record<string, string>,
  token?: string,
  version?: string,
) {
  const pack = parseEoiPack(input);
  const hashes = z.record(z.string().max(100), z.string().regex(/^[a-f0-9]{64}$/)).parse(media);
  const { client, owner, course } = await eoiContext();
  if (course !== expectedCourse) throw Error("course-changed");
  const { data, error } = await client.rpc("eoi_save_versioned", {
    p_course: course,
    ...(version ? { p_version: version } : {}),
    p_pack: pack,
    p_media: hashes,
    p_apply: token !== undefined,
    ...(token === undefined ? {} : { p_preview: token }),
  });
  if (error) {
    const safe =
      /^(media-busy|editor-conflict|ambiguous-word|preview-changed|missing-audio|title-in-use|shared-source-changed|linked-word-changed|review-meanings|deck-conflict|item-changed)/.exec(
        error.message,
      )?.[1];
    throw Error(safe ?? "save-failed");
  }
  if (token !== undefined) await collectUnusedAudio(client, owner, course);
  return token === undefined
    ? { preview: previewSchema.parse(data) }
    : z.object({ deck: z.uuid(), version: z.string() }).parse(data);
}
export async function getEoiPack(deckId: string) {
  if (!z.uuid().safeParse(deckId).success) return null;
  const { client, course, owner } = await eoiContext();
  const { data, error } = await client
    .from("decks")
    .select("title,eoi_manifest,updated_at")
    .eq("id", deckId)
    .eq("owner_id", owner)
    .eq("course_id", course)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw Error("read-failed");
  if (!data?.eoi_manifest) return null;
  const manifest = data.eoi_manifest as Record<string, Json>;
  const keys = z.array(z.string()).parse(manifest["sources"]);
  const { data: raw, error: err } = await client.rpc("eoi_read_sources", {
    p_course: course,
    p_keys: keys,
  });
  if (err) throw Error("source-failed");
  const sources = sourceContent(raw);
  const hashes: Record<string, string> = {};
  const pack = parseEoiPack(
    JSON.stringify({
      ...manifest,
      title: data.title,
      sources: keys.map((k) => {
        const s = sources[k];
        if (!s) throw Error("missing-source");
        const { hash, ...rest } = s;
        if (hash && s.audio) hashes[s.audio] = hash;
        return rest;
      }),
    }),
  );
  return { pack, hashes, version: data.updated_at };
}
export type EoiLoaded = { pack: EoiPack; hashes: Record<string, string>; version: string };

export async function eoiDeckForKey(key: string) {
  const { client, owner, course } = await eoiContext();
  const { data, error } = await client
    .from("decks")
    .select("id")
    .eq("owner_id", owner)
    .eq("course_id", course)
    .eq("eoi_manifest->>key", key)
    .is("archived_at", null)
    .maybeSingle();
  if (error) throw Error("read-failed");
  return data?.id;
}

async function collectUnusedAudio(
  client: Awaited<ReturnType<typeof eoiContext>>["client"],
  owner: string,
  course: string,
) {
  try {
    const unused = await client.rpc("eoi_collect_audio", { p_course: course });
    if (!unused.data?.length) return;
    const hashes = unused.data.map((row) => row.hash);
    const removed = await client.storage
      .from("study-audio")
      .remove(hashes.map((h) => [owner, course, h].join("/")));
    if (!removed.error)
      await client.rpc("eoi_finish_audio_gc", { p_course: course, p_hashes: hashes });
  } catch {
    /* Retry when the owner next opens or saves an EOI pack. */
  }
}
export async function maintainEditorAudio(expectedCourse: string) {
  const { client, course, owner } = await eoiContext();
  if (expectedCourse === course) await collectUnusedAudio(client, owner, course);
}
export async function findEditorSources(expectedCourse: string, filter: string) {
  const { client, course } = await eoiContext();
  if (expectedCourse !== course) throw Error("course-changed");
  const { data, error } = await client.rpc("eoi_find_sources", {
    p_course: course,
    p_filter: filter.slice(0, 160),
  });
  if (error) throw Error("read-failed");
  return data;
}
export async function selectEditorSource(expectedCourse: string, key: string) {
  const { client, course } = await eoiContext();
  if (expectedCourse !== course) throw Error("course-changed");
  const { data, error } = await client.rpc("eoi_read_sources", { p_course: course, p_keys: [key] });
  if (error) throw Error("read-failed");
  return sourceContent(data)[key] ?? null;
}
