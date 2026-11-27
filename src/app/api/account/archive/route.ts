import {
  archiveRequestSchema,
  ARCHIVE_HEADER_BYTES,
} from "@/modules/data-management/application/account-archive";
import { isPrivateAccessEnabled } from "@/composition/deployment";
import { clientEnv } from "@/env/client";
import { executeArchiveRequest } from "@/composition/account-archive";
import { readPrivateJson } from "@/shared/presentation/http/read-private-json";

export const maxDuration = 60;
const headers = {
  "Cache-Control": "private, no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
};
const statuses: Record<string, number> = {
  "28000": 401,
  PT401: 401,
  PT403: 403,
  PT409: 409,
  PT413: 413,
  PT422: 422,
  PT429: 429,
};
const failure = (status: number) => new Response(null, { status, headers });
export async function POST(request: Request) {
  if (!isPrivateAccessEnabled()) return failure(403);
  const body = await readPrivateJson(request, clientEnv.NEXT_PUBLIC_SITE_URL, ARCHIVE_HEADER_BYTES);
  if (!body.ok) return failure(body.status);
  const parsed = archiveRequestSchema.safeParse(body.value);
  if (!parsed.success) return failure(400);
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55000)]);
    const { data, error } = await executeArchiveRequest(parsed.data, signal);
    if (error) return failure(statuses[error.code] ?? (/^(22|23)/.test(error.code) ? 400 : 503));
    if (
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      "error" in data &&
      data["error"] === "too-large"
    )
      return failure(413);
    return Response.json(data, { headers });
  } catch {
    return failure(503);
  }
}
