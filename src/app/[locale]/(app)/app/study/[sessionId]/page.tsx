import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { getStudyContextForCurrentUser } from "@/composition/study";
import { Link } from "@/i18n/navigation";
import { getStudySessionCard } from "@/modules/study/application/study-card";
import { StudyCardView } from "../study-card-view";
import { StudyStepWait } from "../study-step-wait";
import { FormError } from "@/shared/presentation/components";
import {
  getStudySessionSummary,
  type SessionSummary,
} from "@/modules/study/application/session-summary";
import { StudyError } from "@/modules/study/application/study-error";
import { SessionSummaryView } from "../session-summary-view";
import { isIanaTimeZone } from "@/modules/study/domain/study-day";

export default async function StudySessionPage({
  params,
}: {
  params: Promise<{ locale: string; sessionId: string }>;
}) {
  const { locale, sessionId } = await params;
  setRequestLocale(locale);
  if (!(await hasCompletedOnboardingForCurrentUser())) redirect(`/${locale}/onboarding`);
  const context = await getStudyContextForCurrentUser();
  if (!context) redirect(`/${locale}/login`);
  const now = context.clock.now();
  const result = await getStudySessionCard(context.sessions, context.dailyQueue, context.cards, {
    ownerId: context.ownerId,
    sessionId,
    now,
    timeZone: context.timeZone,
  });
  if (!result.ok && result.reason === "not-found") notFound();
  let summary: SessionSummary | null = null;
  const showSummary = result.ok && result.session.status !== "active";
  if (showSummary) {
    try {
      const loaded = await getStudySessionSummary(
        context.sessions,
        context.sessionHistory,
        context.dailyQueue,
        {
          ownerId: context.ownerId,
          sessionId,
          now,
          timeZone: context.timeZone,
        },
      );
      if (loaded.ok) summary = loaded.summary;
    } catch (error) {
      if (!(error instanceof StudyError)) throw error;
      console.error("Study session summary failed", error.kind);
    }
  }
  const t = await getTranslations("StudySession");
  const tToday = await getTranslations("Today");
  const tCard = await getTranslations("PracticeCard");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/app"
        className="inline-flex min-h-11 items-center text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("backToToday")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">
        {result.ok ? t(`sessionStatuses.${result.session.status}`) : t("sessionTitle")}
      </h1>
      {!result.ok ? (
        <FormError id="study-session-error">
          <p>{t(`errors.${result.reason}`)}</p>
        </FormError>
      ) : (
        <section className="flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5">
          <p role="status">{t("saved")}</p>
          <p className="text-sm text-(--color-ink-muted)">
            {t("startedAt", {
              date: isIanaTimeZone(context.timeZone)
                ? new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "es-ES", {
                    timeZone: context.timeZone,
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(result.session.startedAt)
                : result.session.startedAt.toISOString(),
            })}
          </p>
          <p className="font-medium">
            {result.session.scope.deckIds === null
              ? t("scopeAll")
              : t("scopeSelected", { count: result.session.scope.deckIds.length })}
          </p>
          {result.queue ? (
            <>
              <p className="text-xl font-semibold" data-testid="session-available">
                {t("availableNow", { count: result.queue.entries.length })}
              </p>
              <p className="text-sm leading-relaxed text-(--color-ink-muted)">
                {t(result.card ? "practicePending" : "changedAvailability")}
              </p>
              {result.queue.hiddenDueReviews > 0 && (
                <p className="text-sm">
                  {tToday("hiddenReviews", { count: result.queue.hiddenDueReviews })}
                </p>
              )}
              {result.queue.hiddenNew > 0 && (
                <p className="text-sm">{tToday("hiddenNew", { count: result.queue.hiddenNew })}</p>
              )}
            </>
          ) : (
            <p className="text-sm">
              {t(result.session.status === "paused" ? "pausedHint" : "closedHint")}
            </p>
          )}
        </section>
      )}
      {result.ok && (
        <StudyCardView
          key={`${sessionId}:${result.session.status}`}
          locale={locale}
          sessionId={sessionId}
          card={result.card}
          session={{
            status: result.session.status,
            canComplete: result.queue?.entries.length === 0,
          }}
        />
      )}
      {result.ok && result.queue?.entries.length === 0 && result.queue.nextLearningDueAt && (
        <StudyStepWait remainingMs={result.queue.nextLearningDueAt.getTime() - now.getTime()} />
      )}
      {showSummary && <SessionSummaryView summary={summary} />}
      {result.ok && result.queue && result.queue.entries.length > 0 && !result.card && (
        <div className="flex flex-col gap-3">
          <p role="status">{tCard("unavailable")}</p>
          <Link
            href={`/app/study/${result.session.id}`}
            prefetch={false}
            className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
          >
            {tCard("reload")}
          </Link>
        </div>
      )}
      <Link
        href="/app/study"
        prefetch={false}
        className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
      >
        {t("prepareAnother")}
      </Link>
    </main>
  );
}
