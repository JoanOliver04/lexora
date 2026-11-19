"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCourseForCurrentUser } from "@/composition/courses";
import type { CreateCourseError } from "@/modules/courses/application/create-course";

export interface CreateCourseState {
  error?: CreateCourseError;
}

export async function createLanguageCourseAction(
  _previous: CreateCourseState,
  formData: FormData,
): Promise<CreateCourseState> {
  const locale = formData.get("locale") === "en" ? "en" : "es";
  const result = await createCourseForCurrentUser({
    title: formData.get("title"),
    targetLocale: formData.get("targetLocale"),
    profileVersion: formData.get("profileVersion"),
  });
  if (!result) redirect(`/${locale}/login`);
  if (!result.ok) return { error: result.error };
  revalidatePath("/[locale]/(app)", "layout");
  redirect(`/${locale}/app`);
}
