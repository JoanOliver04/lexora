import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyQueueRepository, QueueScope } from "@/modules/study/application/daily-queue";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import type { QueueEntry, QueueGroup } from "@/modules/study/domain/queue";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";
import type { Database } from "@/shared/infrastructure/supabase/database.types";
import { readStudyRows, STUDY_PAGE_SIZE } from "./read-study-rows";
import { estimateRecallAfterDays } from "./ts-fsrs-scheduler";

function scopeArgs({ ownerId, courseId, deckIds }: QueueScope) {
  return {
    p_owner_id: ownerId,
    p_course_id: courseId,
    ...(deckIds === null ? {} : { p_deck_ids: deckIds }),
  };
}

type ItemRow = Pick<
  Database["public"]["Functions"]["study_queue_items"]["Returns"][number],
  "item_id" | "phase" | "due_at" | "state_id" | "revision"
>;

async function readSlots(
  group: QueueGroup,
  count: number,
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: ItemRow[] | null; error: { code: string; message: string } | null }>,
) {
  const entries: QueueEntry[] = [];
  for (let from = 0; from < count; from += STUDY_PAGE_SIZE) {
    const { data, error } = await page(from, Math.min(count, from + STUDY_PAGE_SIZE) - 1);
    if (error) throw studyErrorFrom(error, "no se pudieron leer las tarjetas disponibles");
    for (const item of data ?? []) {
      entries.push({
        practiceItemId: item.item_id,
        group,
        phase: item.phase,
        dueAt: item.due_at ? new Date(item.due_at) : null,
        learningStateId: item.state_id,
        revision: item.revision,
      });
    }
    if ((data?.length ?? 0) < STUDY_PAGE_SIZE) break;
  }
  return entries;
}

export function createSupabaseDailyQueueRepository(
  client: SupabaseClient<Database>,
): DailyQueueRepository {
  return {
    async getCourseLimits({ ownerId, courseId }) {
      const { data, error } = await client
        .from("course_settings")
        .select("daily_new_limit, maximum_reviews_per_day")
        .eq("user_id", ownerId)
        .eq("course_id", courseId)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "no se pudieron leer los límites del curso");
      return data
        ? {
            dailyNewLimit: data.daily_new_limit,
            maximumReviewsPerDay: data.maximum_reviews_per_day,
          }
        : null;
    },

    async countTodayActivity({ ownerId, courseId, dayStart, dayEnd }) {
      const { data, error } = await client
        .rpc("study_day_activity", {
          p_owner_id: ownerId,
          p_course_id: courseId,
          p_start: dayStart.toISOString(),
          p_end: dayEnd.toISOString(),
        })
        .single();
      if (error) throw studyErrorFrom(error, "no se pudo leer la actividad de hoy");
      return { newIntroduced: data.new_introduced, reviewsDone: data.reviews_done };
    },

    async countEligibleItems(scope, includeDifficulty) {
      const { data, error } = await client
        .rpc("study_queue_counts", {
          ...scopeArgs(scope),
          p_now: scope.now.toISOString(),
          p_include_difficulty: includeDifficulty,
        })
        .single();
      if (error) throw studyErrorFrom(error, "no se pudo contar la cola");
      return {
        learningDue: data.learning_due,
        reviewsDue: data.reviews_due,
        newItems: data.new_items,
        difficultItems: data.difficult_items,
        nextDueAt: data.next_due ? new Date(data.next_due) : null,
        nextLearningDueAt: data.next_learning_due ? new Date(data.next_learning_due) : null,
      };
    },

    async listAvailableEntries(scope, selection, dayStart, firstOnly) {
      const args = scopeArgs(scope);
      const now = scope.now.toISOString();
      const items = () =>
        client.rpc("study_queue_items", args).select("item_id, phase, state_id, due_at, revision");
      // A front or reveal needs one row from the first available group.
      const learningCount = firstOnly ? Math.min(1, selection.learningDue) : selection.learningDue;
      const reviewCount = firstOnly
        ? Math.min(1 - learningCount, selection.availableReviews)
        : selection.availableReviews;
      const newCount = firstOnly
        ? Math.min(1 - learningCount - reviewCount, selection.newAvailable)
        : selection.newAvailable;
      const readReviews = async () => {
        const count = reviewCount;
        if (count === 0) return [];
        if (!selection.hiddenDueReviews) {
          return readSlots("review", count, (from, to) =>
            items()
              .eq("phase", "review")
              .lte("due_at", now)
              .order("due_at")
              .order("item_id")
              .range(from, to),
          );
        }
        const priority = {
          ...args,
          p_now: now,
          p_reference: dayStart.toISOString(),
          p_scheduler: V1_SCHEDULER_CONFIG.schedulerPackageVersion,
          p_config: V1_SCHEDULER_CONFIG.configVersion,
        };
        const groups = await readStudyRows(
          (from, to) =>
            client
              .rpc("study_review_priority_inputs", priority)
              .order("stability")
              .order("elapsed_days")
              .range(from, to),
          "no se pudo priorizar el repaso",
        );
        const scores = groups.map(({ stability, elapsed_days }) => ({
          stability,
          elapsed_days,
          recall: estimateRecallAfterDays(stability, elapsed_days),
        }));
        return readSlots("review", count, (from, to) =>
          client
            .rpc("study_ranked_reviews", {
              ...priority,
              p_limit: count,
              p_scores: scores,
            })
            .order("slot")
            .range(from, to),
        );
      };

      const [learning, reviews, fresh] = await Promise.all([
        readSlots("learning", learningCount, (from, to) =>
          items()
            .in("phase", ["learning", "relearning"])
            .lte("due_at", now)
            .order("due_at")
            .order("item_id")
            .range(from, to),
        ),
        readReviews(),
        readSlots("new", newCount, (from, to) =>
          items().or("phase.is.null,phase.eq.new").order("item_id").range(from, to),
        ),
      ]);
      return [...learning, ...reviews, ...fresh];
    },
  };
}
