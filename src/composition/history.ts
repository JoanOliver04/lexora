import { createSupabaseReviewHistoryRepository } from "@/modules/study/infrastructure/supabase-review-history-repository";
import { createSupabaseDailyQueueRepository } from "@/modules/study/infrastructure/supabase-daily-queue-repository";
import { DEFAULT_STUDY_TIMEZONE } from "@/modules/study/domain/study-day";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
import { createSystemClock } from "@/shared/infrastructure/system-clock";
import { createSupabaseStatisticsRepository } from "@/modules/study/infrastructure/supabase-statistics-repository";

export async function getHistoryContextForCurrentUser() {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getClaims();
  const ownerId = data?.claims.sub;
  if (error || !ownerId) return null;
  return {
    ownerId,
    repository: createSupabaseReviewHistoryRepository(client),
    statistics: createSupabaseStatisticsRepository(client),
    timeZone:
      (await createSupabaseDailyQueueRepository(client).getTimeZone({ ownerId })) ??
      DEFAULT_STUDY_TIMEZONE,
    clock: createSystemClock(),
  };
}
