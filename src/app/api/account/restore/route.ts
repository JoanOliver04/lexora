import { isPrivateAccessEnabled } from "@/composition/deployment";
import { clientEnv } from "@/env/client";
import {
  RESTORE_HTTP_BYTES,
  restoreProgressSchema,
  restoreRequestSchema,
  type RestoreFailure,
} from "@/modules/data-management/application/restore-backup";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
import { readPrivateJson } from "@/shared/presentation/http/read-private-json";

export const maxDuration = 30;
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};
const codes: Record<string, [RestoreFailure, number]> = {
  "28000": ["unauthenticated", 401],
  PT401: ["reauthenticate", 401],
  PT403: ["wrongAccount", 403],
  PT409: ["conflict", 409],
  PT413: ["tooLarge", 413],
  PT422: ["integrity", 422],
  PT429: ["cooldown", 429],
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
  try {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(25000)]);
    const client = await createSupabaseServerClient(signal);
    const auth = await client.auth.getClaims();
    if (auth.error || !auth.data?.claims.sub) return failure("unauthenticated", 401);
    const { data, error } = await client
      .rpc("restore_account_backup", { p_request: parsed.data })
      .abortSignal(signal);
    if (error) {
      const entry = codes[error.code];
      if (entry) return failure(...entry);
      if (/^(22|23)/.test(error.code)) return failure("invalid", 400);
      return failure("unavailable", 503);
    }
    const progress = restoreProgressSchema.safeParse(data);
    return progress.success
      ? Response.json({ ok: true, progress: progress.data }, { headers })
      : failure("unavailable", 503);
  } catch {
    return failure("unavailable", 503);
  }
}
