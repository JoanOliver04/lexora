import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  StudySession,
  StudySessionRepository,
} from "@/modules/study/application/study-session";
import { StudyError, studyErrorFrom } from "@/modules/study/application/study-error";
import { studyScopeFromSnapshot } from "@/modules/study/domain/study-scope";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

type Row = Database["public"]["Tables"]["study_sessions"]["Row"];
function fromRow(row: Row): StudySession {
  const scope = studyScopeFromSnapshot(row.scope);
  if (!scope) throw new StudyError("unavailable", "la sesión tiene un alcance no reconocido");
  return {
    id: row.id,
    ownerId: row.owner_id,
    courseId: row.course_id,
    scope,
    status: row.status,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
  };
}

export function createSupabaseStudySessionRepository(
  client: SupabaseClient<Database>,
): StudySessionRepository {
  return {
    async get({ ownerId, sessionId }) {
      const { data, error } = await client
        .from("study_sessions")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw studyErrorFrom(error, "no se pudo leer la sesión de estudio");
      return data ? fromRow(data) : null;
    },
    async create({ ownerId, sessionId, courseId, scope, startedAt }) {
      const { data, error } = await client
        .from("study_sessions")
        .insert({
          id: sessionId,
          owner_id: ownerId,
          course_id: courseId,
          scope: { deckIds: scope.deckIds },
          started_at: startedAt.toISOString(),
          status: "active",
        })
        .select("*")
        .single();
      if (error) throw studyErrorFrom(error, "no se pudo crear la sesión de estudio");
      return fromRow(data);
    },
  };
}
