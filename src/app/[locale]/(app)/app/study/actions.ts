"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getStudyContextForCurrentUser } from "@/composition/study";
import { routing } from "@/i18n/routing";
import {
  createStudySession,
  type CreateStudySessionReason,
} from "@/modules/study/application/study-session";
import { StudyError } from "@/modules/study/application/study-error";

export interface StudySessionFormState {
  error?: CreateStudySessionReason | "generic";
}

export async function createStudySessionAction(
  _previous: StudySessionFormState,
  formData: FormData,
): Promise<StudySessionFormState> {
  const rawLocale = formData.get("locale");
  const locale =
    typeof rawLocale === "string" &&
    routing.locales.includes(rawLocale as (typeof routing.locales)[number])
      ? rawLocale
      : routing.defaultLocale;
  const context = await getStudyContextForCurrentUser();
  if (!context) redirect(`/${locale}/login`);
  const course = await getActiveCourseForCurrentUser();
  if (!course) redirect(`/${locale}/onboarding`);
  let result;
  try {
    result = await createStudySession(
      context.sessions,
      context.dailyQueue,
      context.todayDashboard,
      {
        ownerId: context.ownerId,
        courseId: course.id,
        now: context.clock.now(),
        timeZone: context.timeZone,
        sessionId: formData.get("sessionId"),
        mode: formData.get("scopeMode"),
        deckIds: formData.getAll("deckIds"),
      },
    );
  } catch (error) {
    if (!(error instanceof StudyError)) throw error;
    console.error("Study session creation failed", error.kind);
    return { error: "generic" };
  }
  if (!result.ok) return { error: result.reason };
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/study`);
  redirect(`/${locale}/app/study/${result.session.id}`);
}
