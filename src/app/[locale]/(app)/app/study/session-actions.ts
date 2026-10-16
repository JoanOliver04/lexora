"use server";

import { revalidatePath } from "next/cache";
import { getStudyContextForCurrentUser } from "@/composition/study";
import { routing } from "@/i18n/routing";
import {
  changeStudySession,
  type ChangeSessionReason,
} from "@/modules/study/application/study-session";
import { StudyError } from "@/modules/study/application/study-error";

export interface SessionChangeState {
  error?: ChangeSessionReason | "generic" | "unauthenticated";
}

export async function changeStudySessionAction(
  _previous: SessionChangeState,
  data: FormData,
): Promise<SessionChangeState> {
  const rawLocale = data.get("locale");
  const locale = routing.locales.find((value) => value === rawLocale) ?? routing.defaultLocale;
  const context = await getStudyContextForCurrentUser();
  if (!context) return { error: "unauthenticated" };
  let result;
  try {
    result = await changeStudySession(context.sessions, context.dailyQueue, {
      ownerId: context.ownerId,
      now: context.clock.now(),
      timeZone: context.timeZone,
      sessionId: data.get("sessionId"),
      action: data.get("action"),
      expectedStatus: data.get("expectedStatus"),
    });
  } catch (error) {
    if (!(error instanceof StudyError)) throw error;
    console.error("Study session transition failed", error.kind);
    return { error: "generic" };
  }
  if (!result.ok) return { error: result.reason };
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/study`);
  revalidatePath(`/${locale}/app/study/${result.session.id}`);
  return {};
}
