import type { SupabaseClient } from "@supabase/supabase-js";
import type { CourseCreationRepository, CreateCourseError } from "../application/create-course";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

const errors: Partial<Record<string, CreateCourseError>> = {
  "22023": "invalid",
  PT409: "conflict",
  PT422: "limit",
};

export function createSupabaseCourseCreationRepository(
  client: SupabaseClient<Database>,
): CourseCreationRepository {
  return {
    async listTargetLocales() {
      const { data, error } = await client
        .from("languages")
        .select("locale")
        .eq("active", true)
        .neq("code", "es")
        .order("locale");
      if (error) throw new Error("Course language catalogue unavailable");
      const locales = data.map(({ locale }) => locale);
      return locales.includes("en-GB") ? locales.filter((locale) => locale !== "en") : locales;
    },
    async create(draft) {
      const { error } = await client.rpc("create_study_course", {
        p_title: draft.title,
        p_target_locale: draft.targetLocale,
        p_profile_version: draft.profileVersion,
        ...(draft.targetLanguageName === null
          ? {}
          : { p_target_language_name: draft.targetLanguageName }),
      });
      return error ? { ok: false, error: errors[error.code] ?? "unavailable" } : { ok: true };
    },
  };
}
