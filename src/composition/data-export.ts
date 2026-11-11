import "server-only";
export { formatDataExport } from "@/modules/data-management/infrastructure/export-format";
import { exportOwnData } from "@/modules/data-management/application/export-data";
import { createSupabaseDataExportRepository } from "@/modules/data-management/infrastructure/supabase-data-export-repository";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
export async function exportDataForCurrentUser() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  const ownerId = data?.claims.sub;
  if (error || !ownerId) return { ok: false as const, error: "unauthenticated" as const };
  return exportOwnData(createSupabaseDataExportRepository(client), ownerId);
}
