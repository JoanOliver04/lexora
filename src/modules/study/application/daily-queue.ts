import type { DailyQueue, QueueEntry } from "@/modules/study/domain/queue";
import { isIanaTimeZone, studyDayWindow } from "@/modules/study/domain/study-day";
export type {
  DailyQueue,
  QueueCandidate,
  QueueEntry,
  QueueGroup,
} from "@/modules/study/domain/queue";

export interface QueueInventory {
  learningDue: number;
  reviewsDue: number;
  newItems: number;
  difficultItems: number;
  nextDueAt: Date | null;
  nextLearningDueAt: Date | null;
}

export interface QueueScope {
  ownerId: string;
  courseId: string;
  deckIds: string[] | null;
  now: Date;
}

export interface CourseStudyLimits {
  dailyNewLimit: number;
  maximumReviewsPerDay: number | null;
}

export interface TodayStudyActivity {
  newIntroduced: number;
  reviewsDone: number;
}

export interface DailyQueueRepository {
  getCourseLimits(input: { ownerId: string; courseId: string }): Promise<CourseStudyLimits | null>;
  countTodayActivity(input: {
    ownerId: string;
    courseId: string;
    dayStart: Date;
    dayEnd: Date;
  }): Promise<TodayStudyActivity>;
  countEligibleItems(scope: QueueScope, includeDifficulty: boolean): Promise<QueueInventory>;
  listAvailableEntries(
    scope: QueueScope,
    selection: QueueSelection,
    dayStart: Date,
    firstOnly: boolean,
  ): Promise<QueueEntry[]>;
}

export type QueueRead = "all" | "first" | "counts";
export type AvailableDailyQueue = DailyQueue & { availableCount: number };

export type GetDailyQueueResult =
  | { ok: true; queue: AvailableDailyQueue }
  | { ok: false; reason: "not-found" | "invalid-timezone" };

export interface DailyQueueInput {
  ownerId: string;
  courseId: string;
  deckIds?: string[] | null;
  now: Date;
  timeZone: string;
}

export interface QueueSelection {
  learningDue: number;
  availableReviews: number;
  newAvailable: number;
  hiddenDueReviews: number;
  hiddenNew: number;
  newRemaining: number;
}

export async function getQueueAvailability(
  repository: DailyQueueRepository,
  input: DailyQueueInput,
  includeDifficulty: boolean,
) {
  if (!input.ownerId.trim())
    throw new Error("caso de uso de estudio invocado sin identificador de usuario");
  if (!isIanaTimeZone(input.timeZone)) return { ok: false, reason: "invalid-timezone" } as const;
  const { start: dayStart, end: dayEnd } = studyDayWindow(input.now, input.timeZone);
  const course = { ownerId: input.ownerId, courseId: input.courseId };
  const limits = await repository.getCourseLimits(course);
  if (!limits) return { ok: false, reason: "not-found" } as const;
  const scope = { ...course, deckIds: input.deckIds ?? null, now: input.now };
  const [inventory, activity] = await Promise.all([
    repository.countEligibleItems(scope, includeDifficulty),
    repository.countTodayActivity({ ...course, dayStart, dayEnd }),
  ]);

  const newSlots = Math.max(0, limits.dailyNewLimit - activity.newIntroduced);
  const newAvailable = Math.min(inventory.newItems, newSlots);
  const reviewSlots =
    limits.maximumReviewsPerDay === null
      ? inventory.reviewsDue
      : Math.max(0, limits.maximumReviewsPerDay - activity.reviewsDone);
  const availableReviews = Math.min(inventory.reviewsDue, reviewSlots);
  const selection = {
    learningDue: inventory.learningDue,
    newAvailable,
    availableReviews,
    hiddenNew: inventory.newItems - newAvailable,
    hiddenDueReviews: inventory.reviewsDue - availableReviews,
    newRemaining: newSlots - newAvailable,
  };
  return { ok: true, scope, dayStart, inventory, selection } as const;
}

export async function getDailyQueue(
  repository: DailyQueueRepository,
  input: DailyQueueInput,
  read: QueueRead = "all",
): Promise<GetDailyQueueResult> {
  const availability = await getQueueAvailability(repository, input, false);
  if (!availability.ok) return availability;
  const { scope, selection, dayStart, inventory } = availability;
  return {
    ok: true,
    queue: {
      availableCount: selection.learningDue + selection.availableReviews + selection.newAvailable,
      entries:
        read === "counts"
          ? []
          : await repository.listAvailableEntries(scope, selection, dayStart, read === "first"),
      hiddenDueReviews: selection.hiddenDueReviews,
      hiddenNew: selection.hiddenNew,
      newRemaining: selection.newRemaining,
      nextDueAt: inventory.nextDueAt,
      nextLearningDueAt: inventory.nextLearningDueAt,
    },
  };
}
