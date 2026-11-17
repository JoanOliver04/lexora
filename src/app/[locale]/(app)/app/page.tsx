import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { DashboardContent } from "./dashboard-content";

export default async function AppHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deck?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await hasCompletedOnboardingForCurrentUser())) redirect(`/${locale}/onboarding`);
  const activeCourse = await getActiveCourseForCurrentUser();
  if (!activeCourse) redirect(`/${locale}/onboarding`);
  const t = await getTranslations("App");
  const today = await getTranslations("Today");
  const { deck } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-7 sm:px-8 sm:py-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{today("title")}</h1>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-(--color-ink-muted)">
          <p>{t("courseLabel")}</p>
          <h2 className="font-medium break-words text-(--color-ink)">{activeCourse.title}</h2>
        </div>
      </header>
      <Suspense
        fallback={
          <div
            role="status"
            aria-live="polite"
            className="rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-6"
          >
            {today("loading")}
          </div>
        }
      >
        <DashboardContent courseId={activeCourse.id} locale={locale} deckQuery={deck} />
      </Suspense>
    </main>
  );
}
