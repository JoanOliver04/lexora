import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { StatisticsRepository } from "../application/statistics";
import { studyErrorFrom } from "../application/study-error";
import { MEMORY_PHASES, REVIEW_RATINGS } from "../domain/memory";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

const count = z.number().int().nonnegative().safe();
const payload = z.object({
  activity: z
    .array(
      z.object({
        day: z.string(),
        rating: z.enum(REVIEW_RATINGS),
        count,
        duration_ms: count,
        measured: count,
      }),
    )
    .max(360),
  states: z.array(z.object({ phase: z.enum(MEMORY_PHASES), count })).max(4),
  lapses: count,
  overdue: count,
  forecast: z.array(z.object({ day: z.string(), count })).max(7),
  difficult: z
    .array(
      z.object({
        id: z.uuid(),
        concept_id: z.uuid(),
        mode: z.string(),
        title: z.string(),
        lapses: count,
        recent_again: count.max(3),
      }),
    )
    .max(20),
  difficult_total: count,
  durations: z.array(count.max(3600000)).max(100),
});

export function createSupabaseStatisticsRepository(
  client: SupabaseClient<Database>,
): StatisticsRepository {
  return {
    async read({ courseId, days, now, timeZone, deckId }) {
      const { data, error } = await client.rpc("study_statistics", {
        p_course_id: courseId,
        p_days: days,
        p_now: now.toISOString(),
        p_timezone: timeZone,
        ...(deckId ? { p_deck_id: deckId } : {}),
      });
      if (error) throw studyErrorFrom(error, "Could not load study statistics");
      const result = payload.safeParse(data);
      if (!result.success) throw new Error("Invalid statistics response");
      const raw = result.data;
      return {
        activity: raw.activity.map((r) => ({
          day: r.day,
          rating: r.rating,
          count: r.count,
          durationMs: r.duration_ms,
          measured: r.measured,
        })),
        states: raw.states,
        lapses: raw.lapses,
        overdue: raw.overdue,
        forecast: raw.forecast,
        difficult: raw.difficult.map((r) => ({
          id: r.id,
          conceptId: r.concept_id,
          mode: r.mode,
          title: r.title,
          lapses: r.lapses,
          recentAgain: r.recent_again,
        })),
        difficultTotal: raw.difficult_total,
        durations: raw.durations,
      };
    },
  };
}
