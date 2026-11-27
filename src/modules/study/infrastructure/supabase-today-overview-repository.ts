import type { SupabaseClient } from "@supabase/supabase-js";

import type { TodayOverviewRepository } from "@/modules/study/application/today-overview";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import { MAX_REVIEW_DURATION_MS } from "@/modules/study/domain/study-time-estimate";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

export function createSupabaseTodayOverviewRepository(
  client: SupabaseClient<Database>,
): TodayOverviewRepository {
  return {
    async listRecentDurations({ ownerId, since, now, limit }) {
      const { data, error } = await client
        .from("review_logs")
        .select("duration_ms")
        .eq("owner_id", ownerId)
        .gte("reviewed_at", since.toISOString())
        .lte("reviewed_at", now.toISOString())
        .gt("duration_ms", 0)
        .lte("duration_ms", MAX_REVIEW_DURATION_MS)
        .order("reviewed_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);
      if (error) throw studyErrorFrom(error, "no se pudieron leer las duraciones recientes");
      return (data ?? []).map((row) => row.duration_ms);
    },
  };
}
