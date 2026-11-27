import "server-only";
import { deleteOwnAccount } from "@/modules/data-management/application/delete-account";
import {
  createSupabaseAccountDeletionGateway,
  readOwnDeletionFactors,
  drainConfirmedDeletion,
} from "@/modules/data-management/infrastructure/supabase-account-deletion";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";

export async function deleteCurrentAccount(input: unknown) {
  return deleteOwnAccount(
    createSupabaseAccountDeletionGateway(await createSupabaseServerClient()),
    input,
  );
}

export async function getCurrentDeletionFactors() {
  return readOwnDeletionFactors(await createSupabaseServerClient());
}

export async function isCurrentAccountDeletionPending() {
  const client = await createSupabaseServerClient();
  const result = await client.rpc("own_account_deletion_pending");
  if (result.error) throw new Error("Account deletion status unavailable");
  return result.data === true;
}

export async function resumeCurrentAccountDeletion() {
  const client = await createSupabaseServerClient();
  if ((await client.auth.getUser()).error) return { ok: false, error: "unauthenticated" } as const;
  const pending = await client.rpc("own_account_deletion_pending");
  if (pending.error || !pending.data) return { ok: false, error: "unavailable" } as const;
  return drainConfirmedDeletion(client);
}

export async function beginDeletionGoogleChallenge() {
  const client = await createSupabaseServerClient();
  const challenge = await client.rpc("begin_own_deletion_google");
  return challenge.error ? null : challenge.data;
}

export async function completeDeletionGoogleChallenge(code: string, nonce: string) {
  const client = await createSupabaseServerClient();
  // Validate the OAuth return before creating any application profile or doing
  // anything with a different Google identity chosen in the provider's chooser.
  const exchanged = await client.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.session) return false;
  const proof = await client.rpc("confirm_own_deletion_google", { p_nonce: nonce });
  if (!proof.error && proof.data === true) return true;
  await client.auth.signOut({ scope: "local" });
  return false;
}
