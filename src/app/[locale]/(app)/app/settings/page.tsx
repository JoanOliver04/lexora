import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPreferencesForCurrentUser } from "@/composition/preferences";
import { getCurrentUserId } from "@/composition/identity";
import { Link } from "@/i18n/navigation";
import { StudioCredit } from "../../../studio-credit";
import { courseChoiceLabels } from "@/modules/courses/presentation/language-names";
import { FormStatus } from "@/shared/presentation/components";
import { PreferencesForm } from "./preferences-form";
import { ExportControls } from "./export-controls";
import { RestoreControls } from "./restore-controls";
import { DeleteAccountForm } from "./delete-account-form";
import { startGoogleDeletionAction } from "./deletion-actions";
import { getCurrentDeletionFactors } from "@/composition/account-deletion";
import { InstallControls } from "@/shared/presentation/pwa/install-controls";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string; verification?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [snapshot, ownerId] = await Promise.all([
    getPreferencesForCurrentUser(),
    getCurrentUserId(),
  ]);
  if (!ownerId) redirect(`/${locale}/login`);

  const factors = await getCurrentDeletionFactors();
  const t = await getTranslations("Settings");
  const query = await searchParams;
  const saved = query.saved === "1";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-7 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href={snapshot ? "/app" : "/onboarding"}
        className="inline-flex min-h-11 items-center self-start text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t(snapshot ? "back" : "onboarding")}
      </Link>
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-widest text-(--color-ink-muted)">LEXORA</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">
          {t(snapshot ? "intro" : "accountIntro")}
        </p>
      </header>
      {saved && (
        <FormStatus>
          <p>{t("saved")}</p>
        </FormStatus>
      )}
      {snapshot && (
        <>
          <section
            aria-labelledby="preferences-title"
            className="flex min-w-0 flex-col gap-6 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-5 sm:p-7"
          >
            <h2 id="preferences-title" className="text-xl font-semibold">
              {t("preferences")}
            </h2>
            <PreferencesForm
              key={`${snapshot.profileVersion}:${snapshot.settingsVersion}`}
              snapshot={snapshot}
              locale={locale}
            />
          </section>
          <section
            aria-labelledby="course-title"
            className="flex min-w-0 flex-col gap-5 rounded-(--radius-surface) border border-(--color-border) p-5 sm:p-7"
          >
            <h2 id="course-title" className="text-xl font-semibold">
              {t("course")}
            </h2>
            {snapshot.courses.length > 1 ? (
              <PreferencesForm
                key={`course:${snapshot.profileVersion}`}
                snapshot={snapshot}
                locale={locale}
                courseOnly
                courseChoices={courseChoiceLabels(locale, snapshot.courses)}
              />
            ) : (
              <p className="break-words">
                {courseChoiceLabels(locale, snapshot.courses)[0]?.label}
              </p>
            )}
            <Link
              href="/app/courses"
              className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-(--color-accent) underline underline-offset-4"
            >
              {t("manageCourses")}
            </Link>
          </section>
        </>
      )}
      <ExportControls />
      <RestoreControls ownerId={ownerId} />
      <InstallControls />
      <Link
        href="/app/settings/data"
        className="inline-flex min-h-11 items-center self-start text-(--color-accent) underline underline-offset-4"
      >
        {t("dataInformation")}
      </Link>
      <DeleteAccountForm
        factors={factors}
        verifyGoogle={startGoogleDeletionAction.bind(null, locale)}
        googleFailed={query.verification === "failed"}
      />
      <footer>
        <StudioCredit />
      </footer>
    </main>
  );
}
