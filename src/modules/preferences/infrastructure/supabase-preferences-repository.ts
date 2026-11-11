import type { SupabaseClient } from "@supabase/supabase-js";
import { PreferencesError, type PreferencesRepository } from "../application/preferences";
import { THEMES, type AccountTheme } from "../domain/preferences";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

function check(error: { code?: string } | null) {
  if (error)
    throw new PreferencesError(
      error.code === "PT409" ? "conflict" : error.code === "P0002" ? "unavailable" : "generic",
    );
}
export function createSupabasePreferencesRepository(
  client: SupabaseClient<Database>,
): PreferencesRepository {
  return {
    async read(ownerId) {
      const [profile, courses] = await Promise.all([
        client
          .from("profiles")
          .select("ui_locale,theme_preference,timezone,active_course_id,updated_at")
          .eq("id", ownerId)
          .maybeSingle(),
        client
          .from("courses")
          .select("id,title")
          .eq("owner_id", ownerId)
          .eq("active", true)
          .order("created_at")
          .order("id")
          .limit(201),
      ]);
      check(profile.error);
      check(courses.error);
      if (!profile.data || !courses.data?.length) return null;
      if (courses.data.length > 200) throw new PreferencesError("unavailable");
      const p = profile.data;
      const course = courses.data.find((c) => c.id === p.active_course_id) ?? courses.data[0]!;
      const settings = await client
        .from("course_settings")
        .select("daily_new_limit,maximum_reviews_per_day,show_interval_preview,updated_at")
        .eq("course_id", course.id)
        .eq("user_id", ownerId)
        .maybeSingle();
      check(settings.error);
      if (!settings.data) return null;
      const s = settings.data;
      if (!THEMES.includes(p.theme_preference as AccountTheme))
        throw new PreferencesError("generic");
      return {
        courseId: course.id,
        profileVersion: p.updated_at,
        settingsVersion: s.updated_at,
        courses: courses.data,
        uiLocale: p.ui_locale,
        theme: p.theme_preference as AccountTheme,
        timeZone: p.timezone,
        dailyNewLimit: s.daily_new_limit,
        maximumReviews: s.maximum_reviews_per_day,
        showIntervals: s.show_interval_preview,
      };
    },
    async save(_ownerId, change) {
      // The RPC derives ownership from the verified JWT, never from form data.
      const { error } = await client.rpc("save_preferences", {
        p_course_id: change.courseId,
        p_profile_version: change.profileVersion,
        p_settings_version: change.settingsVersion,
        p_ui_locale: change.uiLocale,
        p_theme: change.theme,
        p_timezone: change.timeZone,
        p_daily_new_limit: change.dailyNewLimit,
        ...(change.maximumReviews === null ? {} : { p_maximum_reviews: change.maximumReviews }),
        p_show_intervals: change.showIntervals,
      });
      check(error);
    },
    async selectCourse(_ownerId, change) {
      const { error } = await client.rpc("set_active_course", {
        p_course_id: change.courseId,
        p_profile_version: change.profileVersion,
      });
      check(error);
    },
  };
}
