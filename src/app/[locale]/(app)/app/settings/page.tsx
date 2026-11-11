import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPreferencesForCurrentUser } from "@/composition/preferences";
import { Link } from "@/i18n/navigation";
import { FormStatus } from "@/shared/presentation/components";
import { PreferencesForm } from "./preferences-form";
import { ExportControls } from "./export-controls";
import { DeleteAccountForm } from "./delete-account-form";
import { getCurrentDeletionFactors } from "@/composition/account-deletion";
import { InstallControls } from "@/shared/presentation/pwa/install-controls";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const snapshot = await getPreferencesForCurrentUser();
  if (!snapshot) redirect(`/${locale}/onboarding`);
  const factors = await getCurrentDeletionFactors();
  const t = await getTranslations("Settings");
  const saved = (await searchParams).saved === "1";
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-7 px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/app"
        className="inline-flex min-h-11 items-center self-start text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium tracking-widest text-(--color-ink-muted)">LEXORA</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
        <p className="max-w-prose leading-relaxed text-(--color-ink-muted)">{t("intro")}</p>
      </header>
      {saved && (
        <FormStatus>
          <p>{t("saved")}</p>
        </FormStatus>
      )}
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
        <PreferencesForm
          key={`course:${snapshot.profileVersion}`}
          snapshot={snapshot}
          locale={locale}
          courseOnly
        />
      </section>
      <ExportControls />
      <InstallControls />
      <Link
        href="/app/settings/data"
        className="inline-flex min-h-11 items-center self-start text-(--color-accent) underline underline-offset-4"
      >
        {t("dataInformation")}
      </Link>
      <DeleteAccountForm factors={factors} />
    </main>
  );
}
