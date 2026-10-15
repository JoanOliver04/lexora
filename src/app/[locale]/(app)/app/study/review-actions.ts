"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getStudyContextForCurrentUser } from "@/composition/study";
import { routing } from "@/i18n/routing";
import {
  saveSessionReview,
  type SaveSessionReviewReason,
} from "@/modules/study/application/save-session-review";
import type { ReviewRating } from "@/modules/study/application/study-card";
import { StudyError } from "@/modules/study/application/study-error";
import { V1_SCHEDULER_CONFIG } from "@/modules/study/domain/scheduler-config";

export interface ReviewFormState {
  receipt?: { rating: ReviewRating; replayed: boolean };
  error?: SaveSessionReviewReason | "generic";
  requestId?: string;
}

export async function saveStudyReviewAction(
  _previous: ReviewFormState,
  data: FormData,
): Promise<ReviewFormState> {
  const rawLocale = data.get("locale");
  const locale =
    typeof rawLocale === "string" &&
    routing.locales.includes(rawLocale as (typeof routing.locales)[number])
      ? rawLocale
      : routing.defaultLocale;
  const rawKey = data.get("idempotencyKey");
  const requestId = typeof rawKey === "string" && rawKey.length <= 128 ? rawKey : "";
  const rawRevision = data.get("expectedRevision");
  const expectedRevision =
    rawRevision === "new"
      ? null
      : typeof rawRevision === "string" && /^[1-9]\d*$/.test(rawRevision)
        ? Number(rawRevision)
        : undefined;
  let result;
  try {
    const context = await getStudyContextForCurrentUser();
    if (!context) redirect(`/${locale}/login`);
    result = await saveSessionReview(
      {
        sessions: context.sessions,
        queue: context.dailyQueue,
        cards: context.cards,
        memory: context.learningStates,
        scheduler: context.scheduler,
        committer: context.reviewCommitter,
      },
      {
        ownerId: context.ownerId,
        sessionId: data.get("sessionId"),
        practiceItemId: data.get("practiceItemId"),
        idempotencyKey: rawKey,
        rating: data.get("rating"),
        expectedRevision,
        now: context.clock.now(),
        timeZone: context.timeZone,
        config: V1_SCHEDULER_CONFIG,
      },
    );
  } catch (error) {
    if (!(error instanceof StudyError)) throw error;
    console.error("Study review save failed", error.kind);
    return { error: "generic", requestId };
  }
  if (!result.ok) return { error: result.reason, requestId };
  revalidatePath(`/${locale}/app`);
  revalidatePath(`/${locale}/app/study/${data.get("sessionId")}`);
  return { receipt: { rating: result.rating, replayed: result.replayed }, requestId };
}
