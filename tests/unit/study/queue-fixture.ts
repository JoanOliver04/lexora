import { vi } from "vitest";
import type { DailyQueueRepository, QueueScope } from "@/modules/study/application/daily-queue";
import { assembleDailyQueue, type QueueCandidate } from "@/modules/study/domain/queue";

type Fixture = Pick<DailyQueueRepository, "getCourseLimits" | "countTodayActivity"> & {
  listEligibleItems(scope: Omit<QueueScope, "now">): Promise<QueueCandidate[]>;
};

// Use the domain's reference implementation for in-memory session and import fixtures.
export function queueFixture(ports: Fixture) {
  const reads = new WeakMap<QueueScope, QueueCandidate[]>();
  const repository = {
    ...ports,
    countEligibleItems: vi.fn<DailyQueueRepository["countEligibleItems"]>(async (scope) => {
      const { ownerId, courseId, deckIds, now } = scope;
      const candidates = await repository.listEligibleItems({ ownerId, courseId, deckIds });
      reads.set(scope, candidates);
      const queue = assembleDailyQueue({
        candidates,
        now,
        dailyNewLimit: Number.MAX_SAFE_INTEGER,
        maximumReviewsPerDay: null,
        newIntroducedToday: 0,
        reviewsDoneToday: 0,
      });
      const count = (group: string) =>
        queue.entries.filter((entry) => entry.group === group).length;
      return {
        learningDue: count("learning"),
        reviewsDue: count("review"),
        newItems: count("new"),
        difficultItems: 0,
        nextDueAt: queue.nextDueAt,
        nextLearningDueAt: queue.nextLearningDueAt,
      };
    }),
    listAvailableEntries: vi.fn<DailyQueueRepository["listAvailableEntries"]>(
      async (scope, selection, _dayStart, firstOnly) =>
        assembleDailyQueue({
          candidates: reads.get(scope) ?? [],
          now: scope.now,
          dailyNewLimit: selection.newAvailable,
          maximumReviewsPerDay: selection.availableReviews,
          newIntroducedToday: 0,
          reviewsDoneToday: 0,
        }).entries.slice(0, firstOnly ? 1 : undefined),
    ),
  };
  return repository;
}
