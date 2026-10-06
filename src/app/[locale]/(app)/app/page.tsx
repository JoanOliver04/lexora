import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";
import { DashboardContent } from "./dashboard-content";

/** Today is read-only. Session creation is introduced separately in LEX-6.3. */
export default async function AppHome({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deck?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (!(await hasCompletedOnboardingForCurrentUser())) {
    redirect(`/${locale}/onboarding`);
  }

  const activeCourse = await getActiveCourseForCurrentUser();
  if (!activeCourse) {
    redirect(`/${locale}/onboarding`);
  }

  const t = await getTranslations("App");
  const tAuth = await getTranslations("Auth");
  const tToday = await getTranslations("Today");
  const { deck } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/app"
          className="inline-flex min-h-11 items-center text-lg font-semibold tracking-tight"
        >
          Lexora
        </Link>
        <form action={logoutAction}>
          <input type="hidden" name="locale" value={locale} />
          <Button type="submit" variant="secondary">
            {tAuth("logout")}
          </Button>
        </form>
      </div>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{tToday("title")}</h1>
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
            {tToday("loading")}
          </div>
        }
      >
        <DashboardContent courseId={activeCourse.id} locale={locale} deckQuery={deck} />
      </Suspense>
      <nav className="flex flex-wrap gap-x-6 gap-y-2">
        <Link
          href="/decks"
          className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
        >
          {t("decksLink")}
        </Link>
        <Link
          href="/concepts"
          className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
        >
          {t("conceptsLink")}
        </Link>
        <Link
          href="/import"
          className="inline-flex min-h-11 items-center text-(--color-accent) underline underline-offset-4"
        >
          {t("importLink")}
        </Link>
      </nav>
    </main>
  );
}
