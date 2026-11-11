import { isPrivateAccessEnabled } from "@/composition/deployment";
import { transferImportForCurrentUser } from "@/composition/import-transfer";
import { clientEnv } from "@/env/client";
import { IMPORT_HTTP_BYTES } from "@/modules/importing/application/import-transfer";
import { readPrivateJson } from "@/shared/presentation/http/read-private-json";
export const maxDuration = 20;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
export async function POST(request: Request) {
  if (!isPrivateAccessEnabled()) return new Response(null, { status: 403, headers });
  const input = await readPrivateJson(request, clientEnv.NEXT_PUBLIC_SITE_URL, IMPORT_HTTP_BYTES);
  if (!input.ok) return new Response(null, { status: input.status, headers });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
  const result = await transferImportForCurrentUser(input.value, signal);
  const status = result.ok
    ? 200
    : result.error === "unauthenticated"
      ? 401
      : result.error === "not-found"
        ? 404
        : result.error === "invalid-input"
          ? 400
          : result.error === "conflict"
            ? 409
            : result.error === "cooldown"
              ? 429
              : 503;
  return Response.json(result, {
    status,
    headers: { ...headers, ...(status === 429 ? { "Retry-After": "2" } : {}) },
  });
}
