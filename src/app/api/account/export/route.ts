import { z } from "zod";
import { clientEnv } from "@/env/client";
import { isPrivateAccessEnabled } from "@/composition/deployment";
import { exportDataForCurrentUser, formatDataExport } from "@/composition/data-export";
import { DataExportError } from "@/modules/data-management/application/export-data";
import type { DataExportFailure } from "@/modules/data-management/domain/data-export";

const headers = {
  "Cache-Control": "private, no-store, no-transform, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
function failure(error: DataExportFailure) {
  return Response.json(
    { error },
    {
      status:
        error === "unauthenticated"
          ? 401
          : error === "cooldown"
            ? 429
            : error === "too-large"
              ? 413
              : error === "invalid-input"
                ? 400
                : 503,
      headers: { ...headers, ...(error === "cooldown" ? { "Retry-After": "60" } : {}) },
    },
  );
}
export async function POST(request: Request) {
  if (!isPrivateAccessEnabled()) return new Response(null, { status: 403, headers });
  if (request.headers.get("origin") !== new URL(clientEnv.NEXT_PUBLIC_SITE_URL).origin)
    return new Response(null, { status: 403, headers });
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    return new Response(null, { status: 415, headers });
  const reader = request.body?.getReader();
  if (!reader) return failure("invalid-input");
  let size = 0,
    body = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 128) {
        await reader.cancel();
        return failure("too-large");
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch {
    return failure("invalid-input");
  } finally {
    reader.releaseLock();
  }
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return failure("invalid-input");
  }
  const parsed = z
    .object({ format: z.enum(["json", "csv"]) })
    .strict()
    .safeParse(input);
  if (!parsed.success) return failure("invalid-input");
  const result = await exportDataForCurrentUser();
  if (!result.ok) return failure(result.error);
  try {
    const artifact = formatDataExport(result.snapshot, parsed.data.format);
    const iterator = artifact.chunks();
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        const next = iterator.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      },
      cancel() {
        iterator.return(undefined);
      },
    });
    return new Response(stream, {
      headers: {
        ...headers,
        "Content-Type": artifact.contentType,
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "X-Lexora-Bytes": String(artifact.bytes),
        "X-Lexora-SHA256": artifact.sha256,
      },
    });
  } catch (error) {
    if (!(error instanceof DataExportError)) throw error;
    return failure(error.kind);
  }
}
