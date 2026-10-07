import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import {
  createStudySessionId,
  getStudyContextForCurrentUser,
  type StudyContext,
} from "@/composition/study";
import { Link } from "@/i18n/navigation";
import { getStudySetup } from "@/modules/study/application/study-session";
import { FormError } from "@/shared/presentation/components";

import { ScopeForm } from "./scope-form";

export default async function StudySetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deck?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await hasCompletedOnboardingForCurrentUser())) redirect(`/${locale}/onboarding`);
  const course = await getActiveCourseForCurrentUser();
  if (!course) redirect(`/${locale}/onboarding`);
  const context = await getStudyContextForCurrentUser();
  if (!context) redirect(`/${locale}/login`);
  const t = await getTranslations("StudySession");
  const { deck } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/app"
        className="inline-flex min-h-11 items-center text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("backToToday")}
      </Link>
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("setupTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-(--color-ink-muted)">{t("setupIntro")}</p>
        <p className="mt-2 text-sm font-medium break-words">{course.title}</p>
      </header>
      <Suspense
        fallback={
          <p role="status" aria-live="polite">
            {t("loading")}
          </p>
        }
      >
        <ScopeSelector context={context} courseId={course.id} locale={locale} deckQuery={deck} />
      </Suspense>
      <Link
        href="/decks"
        className="inline-flex min-h-11 items-center text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("manageDecks")}
      </Link>
    </main>
  );
}

/** Stream setup data only; session detail authorization must precede streaming. */
async function ScopeSelector({
  context,
  courseId,
  locale,
  deckQuery,
}: {
  context: StudyContext;
  courseId: string;
  locale: string;
  deckQuery: unknown;
}) {
  const t = await getTranslations("StudySession");
  const tToday = await getTranslations("Today");
  const result = await getStudySetup(context.dailyQueue, context.todayDashboard, {
    ownerId: context.ownerId,
    courseId,
    now: context.clock.now(),
    timeZone: context.timeZone,
    deckQuery,
  });
  if (!result.ok)
    return (
      <div className="flex flex-col gap-4">
        <FormError id="study-setup-error">
          <p>{t(`errors.${result.reason}`)}</p>
        </FormError>
        <Link
          href="/app/study"
          className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
        >
          {t("resetScope")}
        </Link>
      </div>
    );
  return (
    <>
      <section className="space-y-2 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5">
        <p className="font-medium">
          {t("courseAvailable", { count: result.setup.courseQueue.entries.length })}
        </p>
        <p className="text-sm leading-relaxed text-(--color-ink-muted)">
          {t("courseAvailableHint")}
        </p>
        {result.setup.courseQueue.hiddenDueReviews > 0 && (
          <p className="text-sm">
            {tToday("hiddenReviews", { count: result.setup.courseQueue.hiddenDueReviews })}
          </p>
        )}
        {result.setup.courseQueue.hiddenNew > 0 && (
          <p className="text-sm">
            {tToday("hiddenNew", { count: result.setup.courseQueue.hiddenNew })}
          </p>
        )}
      </section>
      <ScopeForm
        locale={locale}
        sessionId={createStudySessionId()}
        decks={result.setup.decks}
        initialScope={result.setup.scope}
        availableCount={result.setup.courseQueue.entries.length}
      />
    </>
  );
}
