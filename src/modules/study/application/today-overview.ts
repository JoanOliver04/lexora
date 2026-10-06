import { isDifficultItem } from "@/modules/study/domain/difficult-item";
import type { ReviewRating } from "@/modules/study/domain/memory";
import {
  estimateStudyTime,
  RECENT_DURATION_DAYS,
  RECENT_DURATION_SAMPLE_LIMIT,
  type StudyTimeEstimate,
} from "@/modules/study/domain/study-time-estimate";
import {
  loadDailyQueue,
  type DailyQueue,
  type DailyQueueInput,
  type DailyQueueRepository,
} from "./daily-queue";

export interface ItemDifficultySignals {
  practiceItemId: string;
  lapses: number;
  recentRatings: ReviewRating[];
}

export interface TodayOverviewRepository {
  getDifficultySignals(input: {
    ownerId: string;
    practiceItemIds: string[];
    now: Date;
  }): Promise<ItemDifficultySignals[]>;
  listRecentDurations(input: {
    ownerId: string;
    since: Date;
    now: Date;
    limit: number;
  }): Promise<(number | null)[]>;
}

export interface TodayOverview {
  /** All due Review items, including those hidden by the daily limit. */
  dueReviews: number;
  availableReviews: number;
  /** Due Learning and Relearning items; future steps are not ready to study. */
  learningDue: number;
  newAvailable: number;
  /** All difficult eligible items in scope, regardless of due date or limits. */
  difficultItems: number;
  availableCount: number;
  hiddenDueReviews: number;
  hiddenNew: number;
  nextDueAt: Date | null;
  estimate: StudyTimeEstimate;
}

export type GetTodayOverviewResult =
  { ok: true; overview: TodayOverview } | { ok: false; reason: "not-found" | "invalid-timezone" };

function groupCount(queue: DailyQueue, group: "learning" | "review" | "new"): number {
  return queue.entries.filter((entry) => entry.group === group).length;
}

export async function getTodayOverview(
  dailyQueue: DailyQueueRepository,
  history: TodayOverviewRepository,
  input: DailyQueueInput,
): Promise<GetTodayOverviewResult> {
  const loaded = await loadDailyQueue(dailyQueue, input);
  if (!loaded.ok) return loaded;

  const { queue, candidates } = loaded;
  const itemIds = [...new Set(candidates.map((item) => item.practiceItemId))];
  const [signals, durations] = await Promise.all([
    itemIds.length === 0
      ? Promise.resolve([])
      : history.getDifficultySignals({
          ownerId: input.ownerId,
          practiceItemIds: itemIds,
          now: input.now,
        }),
    history.listRecentDurations({
      ownerId: input.ownerId,
      since: new Date(input.now.getTime() - RECENT_DURATION_DAYS * 86_400_000),
      now: input.now,
      limit: RECENT_DURATION_SAMPLE_LIMIT,
    }),
  ]);

  const eligibleIds = new Set(itemIds);
  const difficultIds = new Set(
    signals
      .filter(
        (item) =>
          eligibleIds.has(item.practiceItemId) && isDifficultItem(item.lapses, item.recentRatings),
      )
      .map((item) => item.practiceItemId),
  );
  const availableReviews = groupCount(queue, "review");
  return {
    ok: true,
    overview: {
      dueReviews: availableReviews + queue.hiddenDueReviews,
      availableReviews,
      learningDue: groupCount(queue, "learning"),
      newAvailable: groupCount(queue, "new"),
      difficultItems: difficultIds.size,
      availableCount: queue.entries.length,
      hiddenDueReviews: queue.hiddenDueReviews,
      hiddenNew: queue.hiddenNew,
      nextDueAt: queue.nextDueAt,
      estimate: estimateStudyTime(queue.entries.length, durations),
    },
  };
}
