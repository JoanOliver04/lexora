"use server";

import { redirect } from "next/navigation";

import { getStudyContextForCurrentUser } from "@/composition/study";
import { routing } from "@/i18n/routing";
import {
  revealStudySessionCard,
  type StudyCardContent,
} from "@/modules/study/application/study-card";
import { StudyError } from "@/modules/study/application/study-error";
import {
  getRatingIntervalPreview,
  type RatingIntervalPreview,
} from "@/modules/study/application/rating-interval-preview";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";

export interface RevealFormState {
  content?: StudyCardContent;
  preview?: RatingIntervalPreview;
  previewUnavailable?: boolean;
  error?: "not-found" | "invalid-timezone" | "card-changed" | "generic";
}

export async function revealStudyCardAction(
  _previous: RevealFormState,
  data: FormData,
): Promise<RevealFormState> {
  const rawLocale = data.get("locale");
  const locale =
    typeof rawLocale === "string" &&
    routing.locales.includes(rawLocale as (typeof routing.locales)[number])
      ? rawLocale
      : routing.defaultLocale;
  const context = await getStudyContextForCurrentUser();
  if (!context) redirect(`/${locale}/login`);
  try {
    const now = context.clock.now();
    const result = await revealStudySessionCard(
      context.sessions,
      context.dailyQueue,
      context.cards,
      {
        ownerId: context.ownerId,
        sessionId: data.get("sessionId"),
        practiceItemId: data.get("practiceItemId"),
        now,
        timeZone: context.timeZone,
      },
    );
    if (!result.ok) return { error: result.reason };
    const preview = await getRatingIntervalPreview(context.learningStates, context.scheduler, {
      ownerId: context.ownerId,
      practiceItemId: result.practiceItemId,
      now,
      config: V1_SCHEDULER_CONFIG,
    });
    return preview.ok
      ? { content: result.content, preview: preview.preview }
      : { content: result.content, previewUnavailable: true };
  } catch (error) {
    if (!(error instanceof StudyError)) throw error;
    console.error("Study card reveal failed", error.kind);
    return { error: "generic" };
  }
}
