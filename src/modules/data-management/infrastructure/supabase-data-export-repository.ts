import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { DataExportError, type DataExportRepository } from "../application/export-data";
import { MAX_EXPORT_BYTES } from "../domain/data-export";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
const resultSchema = z.object({
  ok: z.literal(true),
  exportedAt: z.iso.datetime(),
  rows: z.number().int().min(1).max(50000),
  payloadText: z.string().max(MAX_EXPORT_BYTES),
});
export function createSupabaseDataExportRepository(
  client: SupabaseClient<Database>,
): DataExportRepository {
  return {
    async readOwnData() {
      const { data, error } = await client
        .rpc("export_account_data")
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw new DataExportError(error.code === "PT429" ? "cooldown" : "unavailable");
      if (typeof data === "object" && data && "reason" in data && data["reason"] === "too-large")
        throw new DataExportError("too-large");
      const parsed = resultSchema.safeParse(data);
      if (!parsed.success) throw new DataExportError("unavailable");
      return {
        exportedAt: parsed.data.exportedAt,
        rows: parsed.data.rows,
        payloadText: parsed.data.payloadText,
      };
    },
  };
}
