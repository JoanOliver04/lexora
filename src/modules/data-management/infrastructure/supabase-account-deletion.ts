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
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const identities = data.user.identities ?? [];
  const google = identities.some((identity) => identity.provider === "google");
  const proof = google ? await client.rpc("own_deletion_google_verified") : null;
  if (proof?.error) return null;
  const verified = (data.user.factors ?? []).filter((factor) => factor.status === "verified");
  return {
    google,
    password: identities.some((identity) => identity.provider === "email"),
    googleVerified: proof?.data === true,
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
      if ("method" in input) {
        if (!user.identities?.some((identity) => identity.provider === "google"))
          return { ok: false, error: "reauth-required" };
        const proof = await client.rpc("own_deletion_google_verified");
        if (proof.error || !proof.data) return { ok: false, error: "reauth-required" };
      } else {
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
      }
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
      if (result.data === false) return drainConfirmedDeletion(client);
      if (result.data !== true) return { ok: false, error: "unavailable" };
      return signedOutAfterDeletion(client);
    },
  };
}

// The HTTP caller can only resume the durable, already confirmed deletion of its
// own identity. Stop after a bounded batch run so later requests can resume.
export async function drainConfirmedDeletion(
  client: SupabaseClient<Database>,
): Promise<AccountDeletionResult> {
  try {
    for (let batch = 0; batch < 8; batch++) {
      const remaining = await client.rpc("pending_own_account_audio");
      if (remaining.error || !remaining.data) break;
      if (!remaining.data.length) {
        const finished = await client.rpc("finish_own_account_deletion");
        if (!finished.error && finished.data === true) return signedOutAfterDeletion(client);
        break;
      }
      const removed = await client.storage.from("study-audio").remove(remaining.data);
      if (removed.error || !removed.data?.length) break;
    }
  } catch {
    // The next request rereads Storage metadata, including partially removed batches.
  }
  return { ok: false, error: "cleanup-pending" };
}

async function signedOutAfterDeletion(
  client: SupabaseClient<Database>,
): Promise<AccountDeletionResult> {
  try {
    await client.auth.signOut({ scope: "local" });
  } catch {
    // Auth deletion has already committed.
  }
  return { ok: true };
}
