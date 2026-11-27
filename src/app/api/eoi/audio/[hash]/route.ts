import { createHash } from "node:crypto";
import { eoiContext } from "@/composition/eoi";
type Params = { params: Promise<{ hash: string }> };
const bucket = "study-audio";
const cap = 4 * 1024 * 1024;
async function target(params: Params["params"]) {
  const { hash } = await params;
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const { client, owner, course } = await eoiContext();
  return {
    course,
    client,
    store: client.storage.from(bucket),
    path: [owner, course, hash].join("/"),
    hash,
  };
}
export async function GET(req: Request, { params }: Params) {
  try {
    const t = await target(params);
    if (!t) return new Response(null, { status: 404 });
    const file = new URL(req.url).searchParams.get("download");
    const { data, error } = await t.store.createSignedUrl(
      t.path,
      1800,
      file && /^[a-zA-Z0-9_. -]{1,90}$/.test(file) ? { download: file } : undefined,
    );
    if (error || !data) return new Response(null, { status: 404 });
    return new Response(null, {
      status: 307,
      headers: { Location: data.signedUrl, "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response(null, { status: 403 });
  }
}
export async function PUT(req: Request, { params }: Params) {
  if (req.headers.get("origin") !== new URL(req.url).origin)
    return new Response(null, { status: 403 });
  const type = req.headers.get("content-type") ?? "";
  const len = Number(req.headers.get("content-length"));
  if (
    !["audio/mpeg", "audio/ogg", "audio/mp4", "audio/wav", "audio/webm"].includes(type) ||
    !Number.isInteger(len) ||
    len < 1 ||
    len > cap
  )
    return new Response(null, { status: 413 });
  try {
    const t = await target(params);
    if (!t) return new Response(null, { status: 400 });
    if (req.headers.get("x-lexora-course") !== t.course) return new Response(null, { status: 409 });
    const reader = req.body?.getReader();
    if (!reader) return new Response(null, { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > len) {
        await reader.cancel();
        return new Response(null, { status: 413 });
      }
      chunks.push(part.value);
    }
    const body = Buffer.concat(chunks);
    if (size !== len || createHash("sha256").update(body).digest("hex") !== t.hash)
      return new Response(null, { status: 422 });
    const lease = await t.client.rpc("eoi_audio_lease", { p_course: t.course, p_hash: t.hash });
    if (lease.error || !lease.data) return new Response(null, { status: 409 });
    const { error } = await t.store.upload(t.path, body, { contentType: type, upsert: false });
    if (error && String(error.statusCode) !== "409" && !/already exists/i.test(error.message))
      return new Response(null, { status: 503 });
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 403 });
  }
}
