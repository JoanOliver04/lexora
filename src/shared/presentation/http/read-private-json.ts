/** Cookie-authenticated mutations require the configured origin, never Host headers. */
export async function readPrivateJson(
  request: Request,
  origin: string,
  maxBytes: number,
): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 403 | 413 | 415 }> {
  if (request.headers.get("origin") !== new URL(origin).origin) return { ok: false, status: 403 };
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return { ok: false, status: 415 };
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, status: 400 };
  let size = 0,
    body = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { ok: false, status: 413 };
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false, status: 400 };
  } finally {
    reader.releaseLock();
  }
}
