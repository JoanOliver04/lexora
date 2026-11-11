import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import type {
  AccountDeletionFactors,
  AccountDeletionGateway,
  AccountDeletionResult,
} from "../application/delete-account";

export async function readOwnDeletionFactors(
  client: SupabaseClient<Database>,
): Promise<AccountDeletionFactors | null> {
  // listFactors uses a live Auth getUser; only the session owner's factors return.
  const result = await client.auth.mfa.listFactors();
  if (result.error) return null;
  const verified = result.data.all.filter((f) => f.status === "verified");
  return {
    requiresMfa: verified.length > 0,
    factors: verified
      .filter((f) => f.factor_type === "totp")
      .map((f) => ({ id: f.id, label: f.friendly_name?.slice(0, 80) || null })),
  };
}

export function createSupabaseAccountDeletionGateway(
  client: SupabaseClient<Database>,
): AccountDeletionGateway {
  return {
    async reauthenticateAndDelete(input): Promise<AccountDeletionResult> {
      // Live Auth lookup, not an email or identity supplied by the caller/JWT alone.
      const current = await client.auth.getUser();
      const user = current.data.user;
      if (current.error || !user?.email) return { ok: false, error: "unauthenticated" };
      if (user.email.toLowerCase() !== input.email)
        return { ok: false, error: "invalid-credentials" };
      const reauth = await client.auth.signInWithPassword({
        email: user.email,
        password: input.password,
      });
      if (reauth.error)
        return {
          ok: false,
          error:
            reauth.error.status === 429
              ? "cooldown"
              : reauth.error.status === 400
                ? "invalid-credentials"
                : "unavailable",
        };
      if (reauth.data.user.id !== user.id || !reauth.data.session)
        return { ok: false, error: "unauthenticated" };
      const factors = await client.auth.mfa.listFactors();
      if (factors.error) return { ok: false, error: "unavailable" };
      const verified = factors.data.all.filter((f) => f.status === "verified");
      if (verified.length) {
        const totps = verified.filter((f) => f.factor_type === "totp");
        const totp = input.factorId
          ? totps.find((f) => f.id === input.factorId)
          : totps.length === 1
            ? totps[0]
            : undefined;
        if (!totp || !input.otp) return { ok: false, error: "mfa-required" };
        const challenge = await client.auth.mfa.challengeAndVerify({
          factorId: totp.id,
          code: input.otp,
        });
        if (challenge.error)
          return { ok: false, error: challenge.error.status === 429 ? "cooldown" : "mfa-required" };
      }
      const result = await client
        .rpc("delete_own_account", {
          p_email: input.email,
          p_confirmation: input.confirmation,
        })
        .abortSignal(AbortSignal.timeout(15000));
      if (result.error)
        return {
          ok: false,
          error:
            result.error.code === "PT401"
              ? "reauth-required"
              : result.error.code === "PT403"
                ? "mfa-required"
                : "unavailable",
        };
      if (result.data !== true) return { ok: false, error: "unavailable" };
      // Deletion has committed. A stale Auth logout response must not turn it into
      // an apparent failed delete; signOut removes the local SSR session as well.
      try {
        await client.auth.signOut({ scope: "local" });
      } catch {
        /* already deleted */
      }
      return { ok: true };
    },
  };
}
