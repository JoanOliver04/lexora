import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActiveCourse, ActiveCourseRepository } from "../application/active-course";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

const courseColumns = "id,title,target_locale,target_language_name,declared_level,start_level";
type CourseRow = Pick<
  Database["public"]["Tables"]["courses"]["Row"],
  "id" | "title" | "target_locale" | "target_language_name" | "declared_level" | "start_level"
>;

function mapCourse(row: CourseRow): ActiveCourse {
  return {
    id: row.id,
    title: row.title,
    targetLocale: row.target_locale,
    targetLanguageName: row.target_language_name,
    declaredLevel: row.declared_level,
    startLevel: row.start_level,
  };
}

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
    async readWorkspaceProfile(userId) {
      // The composite foreign key embeds precisely the selected course owned by
      // this profile. RLS still applies to both records.
      const profile = await client
        .from("profiles")
        .select(
          `timezone,theme_preference,onboarding_completed_at,course:courses!profiles_active_course_fk(${courseColumns})`,
        )
        .eq("id", userId)
        .eq("course.active", true)
        .maybeSingle();

      if (profile.error) {
        throw new ActiveCourseReadError(
          `no se pudo leer el curso activo (código ${profile.error.code ?? "desconocido"})`,
          { cause: profile.error },
        );
      }

      if (!profile.data) return null;

      let course = profile.data.course;
      if (!course) {
        // Keep the original fallback for an unset or inactive selection.
        const oldest = await client
          .from("courses")
          .select(courseColumns)
          .eq("owner_id", userId)
          .eq("active", true)
          .order("created_at")
          .order("id")
          .limit(1)
          .maybeSingle();
        if (oldest.error) {
          throw new ActiveCourseReadError(
            `no se pudo leer el curso (código ${oldest.error.code ?? "desconocido"})`,
            { cause: oldest.error },
          );
        }
        course = oldest.data;
      }

      return {
        course: course ? mapCourse(course) : null,
        timeZone: profile.data.timezone,
        theme: profile.data.theme_preference,
        onboardingComplete: profile.data.onboarding_completed_at !== null,
      };
    },
  };
}
