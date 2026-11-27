import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
import type { ArchiveRequest } from "@/modules/data-management/application/account-archive";

async function archiveContext(signal: AbortSignal) {
  const client = await createSupabaseServerClient(signal);
  const auth = await client.auth.getClaims();
  return auth.error || !auth.data?.claims.sub ? null : { client, owner: auth.data.claims.sub };
}
export async function executeArchiveRequest(input: ArchiveRequest, signal: AbortSignal) {
  const context = await archiveContext(signal);
  if (!context) return { data: null, error: { code: "28000" } };
  const { client } = context;
  if (input.action === "cleanup") {
    const id = crypto.randomUUID();
    const claimed = await client.rpc("manage_account_archive_media", {
      p_request: { action: "claim", id },
    });
    if (claimed.error) return claimed;
    const batch = z
      .strictObject({
        paths: z.array(z.string()).max(16),
        more: z.boolean(),
        retryAfter: z.number().int().min(1).max(3600).nullable(),
      })
      .safeParse(claimed.data);
    if (
      !batch.success ||
      batch.data.paths.some(
        (path) =>
          !path.startsWith(context.owner + "/") ||
          !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f]{64}$/.test(path),
      )
    )
      return { data: null, error: { code: "unavailable" } };
    if (batch.data.paths.length) {
      await client.storage.from("study-audio").remove(batch.data.paths);
      // A lost Storage response is harmless when the objects really disappeared.
      const finish = await client.rpc("manage_account_archive_media", {
        p_request: { action: "finish", id },
      });
      if (finish.error || finish.data !== true)
        return { data: null, error: { code: "unavailable" } };
    }
    return { data: { more: batch.data.more, retryAfter: batch.data.retryAfter }, error: null };
  }
  if (input.action === "start") return client.rpc("start_account_archive");
  if (input.action === "page")
    return client.rpc("read_account_archive_page", {
      p_entity: input.entity,
      p_after: input.after ?? [],
      p_rows: input.rows,
      p_offset: input.offset,
    });
  return client.rpc("restore_account_archive", { p_request: input });
}
export async function ownArchiveAudio(course: string, hash: string, signal: AbortSignal) {
  const context = await archiveContext(signal);
  if (!context) return null;
  return {
    store: context.client.storage.from("study-audio"),
    path: [context.owner, course, hash].join("/"),
    hash,
    manage: (action: "reserve" | "settle", id: string) =>
      context.client.rpc("manage_account_archive_media", {
        p_request: { action, id, course, hash },
      }),
  };
}
