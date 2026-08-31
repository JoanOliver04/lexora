import type { SupabaseClient } from "@supabase/supabase-js";

import {
  type ActiveCourse,
  type ActiveCourseRepository,
  pickActiveCourse,
} from "@/modules/courses/application/active-course";
import type { CefrLevel } from "@/modules/courses/domain/onboarding";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

/**
 * Implementación de `ActiveCourseRepository` sobre Supabase.
 *
 * Dos lecturas y una decisión pura. Ambas consultas van bajo la identidad del
 * usuario: `courses_select_own` y `profiles_select_own` (LEX-2.3) garantizan
 * que solo ve lo suyo, así que aunque `active_course_id` señalara un curso
 * ajeno —cosa que la FK compuesta ya impide escribir— no aparecería aquí y
 * `pickActiveCourse` caería al más antiguo.
 */
export class ActiveCourseReadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ActiveCourseReadError";
  }
}

export function createSupabaseActiveCourseRepository(
  client: SupabaseClient<Database>,
): ActiveCourseRepository {
  return {
    async getActiveCourse(userId: string): Promise<ActiveCourse | null> {
      const profile = await client
        .from("profiles")
        .select("active_course_id")
        .eq("id", userId)
        .maybeSingle();

      if (profile.error) {
        throw new ActiveCourseReadError(
          `no se pudo leer el curso activo (código ${profile.error.code ?? "desconocido"})`,
          { cause: profile.error },
        );
      }

      const courses = await client
        .from("courses")
        .select("id, title, target_locale, declared_level, start_level")
        .eq("owner_id", userId)
        // Mismo orden que `complete_onboarding` al elegir «el más antiguo»
        // (`created_at asc, id asc`): con `created_at` empatado —dos cursos en
        // la misma transacción— el desempate por `id` evita que el shell
        // muestre un curso distinto del que actualizó el onboarding.
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (courses.error) {
        throw new ActiveCourseReadError(
          `no se pudieron leer los cursos (código ${courses.error.code ?? "desconocido"})`,
          { cause: courses.error },
        );
      }

      const rows: ActiveCourse[] = (courses.data ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        targetLocale: row.target_locale,
        declaredLevel: row.declared_level as CefrLevel | null,
        startLevel: row.start_level as CefrLevel | null,
      }));

      return pickActiveCourse(rows, profile.data?.active_course_id ?? null);
    },
  };
}
