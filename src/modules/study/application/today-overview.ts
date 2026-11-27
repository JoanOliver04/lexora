import {
  estimateStudyTime,
  RECENT_DURATION_DAYS,
  RECENT_DURATION_SAMPLE_LIMIT,
  type StudyTimeEstimate,
} from "@/modules/study/domain/study-time-estimate";
import {
  getQueueAvailability,
  type DailyQueueInput,
  type DailyQueueRepository,
} from "./daily-queue";

export interface TodayOverviewRepository {
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

export async function getTodayOverview(
  dailyQueue: DailyQueueRepository,
  history: TodayOverviewRepository,
  input: DailyQueueInput,
): Promise<GetTodayOverviewResult> {
  const availability = await getQueueAvailability(dailyQueue, input, true);
  if (!availability.ok) return availability;
  const { inventory, selection } = availability;
  const durations = await history.listRecentDurations({
    ownerId: input.ownerId,
    since: new Date(input.now.getTime() - RECENT_DURATION_DAYS * 86_400_000),
    now: input.now,
    limit: RECENT_DURATION_SAMPLE_LIMIT,
  });
  const availableCount =
    selection.learningDue + selection.availableReviews + selection.newAvailable;
  return {
    ok: true,
    overview: {
      dueReviews: inventory.reviewsDue,
      availableReviews: selection.availableReviews,
      learningDue: selection.learningDue,
      newAvailable: selection.newAvailable,
      difficultItems: inventory.difficultItems,
      availableCount,
      hiddenDueReviews: selection.hiddenDueReviews,
      hiddenNew: selection.hiddenNew,
      nextDueAt: inventory.nextDueAt,
      estimate: estimateStudyTime(availableCount, durations),
    },
  };
}
