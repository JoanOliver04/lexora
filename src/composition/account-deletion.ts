import "server-only";
import { deleteOwnAccount } from "@/modules/data-management/application/delete-account";
import {
  createSupabaseAccountDeletionGateway,
  readOwnDeletionFactors,
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
