import "server-only";

import {
  restoreProgressSchema,
  type RestoreFailure,
  type RestoreRequest,
  type RestoreResponse,
} from "@/modules/data-management/application/restore-backup";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

const codes: Record<string, RestoreFailure> = {
  "28000": "unauthenticated",
  PT401: "reauthenticate",
  PT403: "wrongAccount",
  PT409: "conflict",
  PT413: "tooLarge",
  PT422: "integrity",
  PT429: "cooldown",
};

export async function restoreDataForCurrentUser(
  request: RestoreRequest,
  signal: AbortSignal,
): Promise<RestoreResponse> {
  try {
    const client = await createSupabaseServerClient(signal);
    const auth = await client.auth.getClaims();
    if (auth.error || !auth.data?.claims.sub) return { ok: false, error: "unauthenticated" };
    const { data, error } = await client
      .rpc("restore_account_backup", { p_request: request })
      .abortSignal(signal);
    if (error) {
      return {
        ok: false,
        error: codes[error.code] ?? (/^(22|23)/.test(error.code) ? "invalid" : "unavailable"),
      };
    }
    const progress = restoreProgressSchema.safeParse(data);
    return progress.success
      ? { ok: true, progress: progress.data }
      : { ok: false, error: "unavailable" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
