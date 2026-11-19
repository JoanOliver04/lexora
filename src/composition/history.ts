import { createSupabaseReviewHistoryRepository } from "@/modules/study/infrastructure/supabase-review-history-repository";
import { createSystemClock } from "@/shared/infrastructure/system-clock";
import { createSupabaseStatisticsRepository } from "@/modules/study/infrastructure/supabase-statistics-repository";
import { getWorkspaceProfileForCurrentUser } from "./courses";
import { getAuthenticatedUser } from "./identity";

export async function getHistoryContextForCurrentUser() {
  const [user, profile] = await Promise.all([
    getAuthenticatedUser(),
    getWorkspaceProfileForCurrentUser(),
  ]);
  if (!user || !profile) return null;
  const { client, ownerId } = user;
  return {
    ownerId,
    repository: createSupabaseReviewHistoryRepository(client),
    statistics: createSupabaseStatisticsRepository(client),
    timeZone: profile.timeZone,
    clock: createSystemClock(),
  };
}
