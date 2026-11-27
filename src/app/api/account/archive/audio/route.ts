import { createHash } from "node:crypto";
import { z } from "zod";
import { isPrivateAccessEnabled } from "@/composition/deployment";
import { clientEnv } from "@/env/client";
import {
  ARCHIVE_AUDIO_BYTES,
  audioMimeSchema,
} from "@/modules/data-management/application/account-archive";
import { ownArchiveAudio } from "@/composition/account-archive";

const headers = {
  "Cache-Control": "private, no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
};
const failure = (status: number) => new Response(null, { status, headers });
async function target(request: Request) {
  if (!isPrivateAccessEnabled()) return null;
  const params = new URL(request.url).searchParams;
  const course = z.uuid().safeParse(params.get("course")),
    hash = params.get("hash");
  if (!course.success || !hash || !/^[0-9a-f]{64}$/.test(hash)) return null;
  return ownArchiveAudio(
    course.data,
    hash,
    AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
  );
}
export async function GET(request: Request) {
  try {
    const t = await target(request);
    if (!t) return failure(403);
    const { data, error } = await t.store.download(t.path);
    if (error || !data) return failure(422);
    const type = audioMimeSchema.safeParse(data.type.split(";")[0]);
    if (!type.success || data.size < 1 || data.size > ARCHIVE_AUDIO_BYTES) return failure(422);
    return new Response(data, {
      headers: { ...headers, "Content-Type": type.data, "Content-Length": String(data.size) },
    });
  } catch {
    return failure(503);
  }
}
export async function PUT(request: Request) {
  if (request.headers.get("origin") !== new URL(clientEnv.NEXT_PUBLIC_SITE_URL).origin)
    return failure(403);
  const type = audioMimeSchema.safeParse(request.headers.get("content-type"));
  const length = Number(request.headers.get("content-length"));
  if (!type.success || !Number.isSafeInteger(length) || length < 1 || length > ARCHIVE_AUDIO_BYTES)
    return failure(413);
  try {
    const t = await target(request);
    if (!t) return failure(403);
    const reader = request.body?.getReader();
    if (!reader) return failure(400);
    const chunks: Uint8Array[] = [],
      digest = createHash("sha256");
    let received = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > length) {
          await reader.cancel();
          return failure(413);
        }
        digest.update(value);
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (received !== length || digest.digest("hex") !== t.hash) return failure(422);
    const restoreId = z.uuid().safeParse(request.headers.get("x-lexora-restore"));
    if (!restoreId.success) return failure(400);
    const reserved = await t.manage("reserve", restoreId.data);
    if (reserved.error) return failure(reserved.error.code === "PT409" ? 409 : 503);
    const result = await t.store.upload(t.path, Buffer.concat(chunks), {
      upsert: false,
      contentType: type.data,
    });
    if (result.error) {
      if (
        String(result.error.statusCode) !== "409" &&
        !/already exists|duplicate/i.test(result.error.message)
      )
        return failure(503);
      const existing = await t.store.download(t.path);
      if (
        existing.error ||
        existing.data.size !== length ||
        createHash("sha256")
          .update(Buffer.from(await existing.data.arrayBuffer()))
          .digest("hex") !== t.hash
      )
        return failure(422);
    }
    const settled = await t.manage("settle", restoreId.data);
    return settled.error ? failure(503) : new Response(null, { status: 204, headers });
  } catch {
    return failure(503);
  }
}
