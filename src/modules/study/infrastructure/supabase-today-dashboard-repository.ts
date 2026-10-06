import type { SupabaseClient } from "@supabase/supabase-js";

import type { TodayDashboardRepository } from "@/modules/study/application/today-dashboard";
import { studyErrorFrom } from "@/modules/study/application/study-error";
import { isMemoryPhase } from "@/modules/study/domain/memory";
import { studyScopeFromSnapshot } from "@/modules/study/domain/study-scope";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

import { readStudyRows } from "./read-study-rows";

export function createSupabaseTodayDashboardRepository(
  client: SupabaseClient<Database>,
): TodayDashboardRepository {
  return {
    async listActiveDecks({ ownerId, courseId }) {
      return readStudyRows(
        (from, to) =>
          client
            .from("decks")
            .select("id, title")
            .eq("owner_id", ownerId)
            .eq("course_id", courseId)
            .is("archived_at", null)
            .order("position")
            .order("id")
            .range(from, to),
        "no se pudieron leer los mazos de Hoy",
      );
    },
    async getLastStudyScope({ ownerId, courseId }) {
      const { data, error } = await client
        .from("study_sessions")
        .select("scope")
        .eq("owner_id", ownerId)
        .eq("course_id", courseId)
        .order("started_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "no se pudo leer el último filtro");
      return data ? studyScopeFromSnapshot(data.scope) : null;
    },
    async listReviewActivity({ ownerId, courseId, since, now }) {
      const rows = await readStudyRows(
        (from, to) =>
          client
            .from("review_logs")
            .select(
              "id, practice_item_id, reviewed_at, duration_ms, state_before, practice_items!inner(concepts!inner(course_id))",
            )
            .eq("owner_id", ownerId)
            .eq("practice_items.concepts.course_id", courseId)
            .gte("reviewed_at", since.toISOString())
            .lte("reviewed_at", now.toISOString())
            .order("reviewed_at")
            .order("id")
            .range(from, to),
        "no se pudo leer la actividad reciente",
      );
      return rows.map((row) => {
        const snapshot = row.state_before;
        const phase =
          typeof snapshot === "object" && snapshot !== null && !Array.isArray(snapshot)
            ? snapshot["phase"]
            : null;
        return {
          id: row.id,
          practiceItemId: row.practice_item_id,
          reviewedAt: new Date(row.reviewed_at),
          durationMs: row.duration_ms,
          phaseBefore: isMemoryPhase(phase) ? phase : null,
        };
      });
    },
  };
}
