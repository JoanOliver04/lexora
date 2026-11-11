"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { savePreferencesForCurrentUser } from "@/composition/preferences";

export interface PreferencesFormState {
  error?: "invalid" | "conflict" | "unavailable" | "generic";
  fields?: string[];
}
function number(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() !== "" ? Number(value) : Number.NaN;
}
export async function savePreferencesAction(
  _previous: PreferencesFormState,
  data: FormData,
): Promise<PreferencesFormState> {
  const courseOnly = data.get("operation") === "course";
  const input = {
    courseId: data.get("courseId"),
    profileVersion: data.get("profileVersion"),
    ...(!courseOnly
      ? {
          settingsVersion: data.get("settingsVersion"),
          uiLocale: data.get("uiLocale"),
          theme: data.get("theme"),
          timeZone: data.get("timeZone"),
          dailyNewLimit: number(data.get("dailyNewLimit")),
          maximumReviews:
            data.get("maximumReviews") === "" ? null : number(data.get("maximumReviews")),
          showIntervals: data.get("showIntervals") === "on",
        }
      : {}),
  };
  const result = await savePreferencesForCurrentUser(input, courseOnly);
  if (!result) return { error: "generic" };
  if (!result.ok) return { error: result.error, fields: result.fields };
  const locale = result.locale ?? (data.get("locale") === "en" ? "en" : "es");
  revalidatePath("/[locale]/(app)", "layout");
  redirect(`/${locale}/app/settings?saved=1`);
}
