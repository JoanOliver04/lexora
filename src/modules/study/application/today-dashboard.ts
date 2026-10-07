import {
  recentStudyDays,
  summarizeStudyActivity,
  type StudyActivityReview,
  type StudyActivityDay,
  type StudyActivityTotals,
} from "@/modules/study/domain/study-activity";
import { isIanaTimeZone } from "@/modules/study/domain/study-day";
import { studyScopeFromQuery, type StudyScope } from "@/modules/study/domain/study-scope";

import type { DailyQueueRepository } from "./daily-queue";
import {
  getTodayOverview,
  type TodayOverview,
  type TodayOverviewRepository,
} from "./today-overview";

export type { StudyActivityDay, StudyActivityTotals, StudyScope };

export interface DashboardDeck {
  id: string;
  title: string;
}

export interface TodayDashboardRepository {
  listActiveDecks(input: { ownerId: string; courseId: string }): Promise<DashboardDeck[]>;
  getLastStudyScope(input: { ownerId: string; courseId: string }): Promise<StudyScope | null>;
  listReviewActivity(input: {
    ownerId: string;
    courseId: string;
    since: Date;
    now: Date;
  }): Promise<StudyActivityReview[]>;
}

export interface TodayDashboard {
  overview: TodayOverview;
  scope: StudyScope;
  scopeDeckNames: string[];
  lastScope: StudyScope | null;
  lastScopeAvailable: boolean;
  status: "ready" | "limited" | "waiting" | "empty";
  days: StudyActivityDay[];
  today: StudyActivityDay;
  week: StudyActivityTotals;
}

export type GetTodayDashboardResult =
  | { ok: true; dashboard: TodayDashboard }
  | { ok: false; reason: "not-found" | "invalid-timezone" | "invalid-filter" };

export async function getTodayDashboard(
  queue: DailyQueueRepository,
  overviewRepository: TodayOverviewRepository,
  dashboardRepository: TodayDashboardRepository,
  input: { ownerId: string; courseId: string; deckQuery?: unknown; now: Date; timeZone: string },
): Promise<GetTodayDashboardResult> {
  if (!input.ownerId.trim())
    throw new Error("caso de uso de estudio invocado sin identificador de usuario");
  if (!isIanaTimeZone(input.timeZone)) return { ok: false, reason: "invalid-timezone" };
  const scope = studyScopeFromQuery(input.deckQuery);
  if (!scope) return { ok: false, reason: "invalid-filter" };
  const [decks, lastScope] = await Promise.all([
    dashboardRepository.listActiveDecks({ ownerId: input.ownerId, courseId: input.courseId }),
    dashboardRepository.getLastStudyScope({ ownerId: input.ownerId, courseId: input.courseId }),
  ]);
  const activeIds = new Set(decks.map((deck) => deck.id));
  if (scope.deckIds?.some((id) => !activeIds.has(id)))
    return { ok: false, reason: "invalid-filter" };
  const windows = recentStudyDays(input.now, input.timeZone);
  const [overviewResult, reviews] = await Promise.all([
    getTodayOverview(queue, overviewRepository, {
      ownerId: input.ownerId,
      courseId: input.courseId,
      deckIds: scope.deckIds,
      now: input.now,
      timeZone: input.timeZone,
    }),
    dashboardRepository.listReviewActivity({
      ownerId: input.ownerId,
      courseId: input.courseId,
      since: windows[0]!.start,
      now: input.now,
    }),
  ]);
  if (!overviewResult.ok) return overviewResult;
  const { overview } = overviewResult;
  const activity = summarizeStudyActivity(windows, reviews, input.now);
  const status =
    overview.availableCount > 0
      ? "ready"
      : overview.hiddenDueReviews > 0 || overview.hiddenNew > 0
        ? "limited"
        : overview.nextDueAt
          ? "waiting"
          : "empty";
  return {
    ok: true,
    dashboard: {
      overview,
      scope,
      scopeDeckNames:
        scope.deckIds === null
          ? []
          : scope.deckIds.map((id) => decks.find((deck) => deck.id === id)!.title),
      lastScope,
      lastScopeAvailable:
        lastScope !== null &&
        (lastScope.deckIds === null ||
          (lastScope.deckIds.length > 0 && lastScope.deckIds.every((id) => activeIds.has(id)))),
      status,
      days: activity.days,
      today: activity.days[6]!,
      week: activity.totals,
    },
  };
}
