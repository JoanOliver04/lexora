import { isPrivateAccessEnabled } from "@/composition/deployment";
import { restoreDataForCurrentUser } from "@/composition/data-restore";
import { clientEnv } from "@/env/client";
import {
  RESTORE_HTTP_BYTES,
  restoreRequestSchema,
  type RestoreFailure,
} from "@/modules/data-management/application/restore-backup";
import { readPrivateJson } from "@/shared/presentation/http/read-private-json";

export const maxDuration = 30;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const statuses: Record<RestoreFailure, number> = {
  unauthenticated: 401,
  reauthenticate: 401,
  invalid: 400,
  version: 400,
  wrongAccount: 403,
  conflict: 409,
  tooLarge: 413,
  integrity: 422,
  cooldown: 429,
  unavailable: 503,
};

function failure(error: RestoreFailure, status: number) {
  return Response.json({ ok: false, error }, { status, headers });
}

export async function POST(request: Request) {
  if (!isPrivateAccessEnabled()) return failure("unauthenticated", 403);
  const body = await readPrivateJson(request, clientEnv.NEXT_PUBLIC_SITE_URL, RESTORE_HTTP_BYTES);
  if (!body.ok) return failure(body.status === 413 ? "tooLarge" : "invalid", body.status);
  const parsed = restoreRequestSchema.safeParse(body.value);
  if (!parsed.success) return failure("invalid", 400);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
  const result = await restoreDataForCurrentUser(parsed.data, signal);
  return result.ok
    ? Response.json(result, { headers })
    : failure(result.error, statuses[result.error]);
}
