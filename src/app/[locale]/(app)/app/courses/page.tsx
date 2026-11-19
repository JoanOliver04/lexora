import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getTargetCourseLocales } from "@/composition/courses";
import { getPreferencesForCurrentUser } from "@/composition/preferences";
import { ClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import {
  courseChoiceLabels,
  courseLanguageNames,
} from "@/modules/courses/presentation/language-names";
import { PreferencesForm } from "../settings/preferences-form";
import { CreateCourseForm } from "./create-course-form";

export default async function CoursesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [snapshot, locales, t] = await Promise.all([
    getPreferencesForCurrentUser(),
    getTargetCourseLocales(),
    getTranslations("Courses"),
  ]);
  if (!snapshot) redirect(`/${locale}/onboarding`);
  const displayLanguage = courseLanguageNames(locale);
  const order = new Intl.Collator(locale);
  const languages = locales
    .map((tag) => ({ locale: tag, label: displayLanguage(tag) }))
    .sort((a, b) => order.compare(a.label, b.label));
  const section =
    "flex min-w-0 flex-col gap-4 rounded-(--radius-surface) border border-(--color-border) bg-(--color-surface) p-[clamp(12px,4vw,28px)]";
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-[clamp(12px,4vw,24px)] py-8 sm:py-12">
      <Link
        href="/app"
        className="inline-flex min-h-11 items-center self-start text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
      <ClientMessages namespaces={["Courses", "Settings", "Theme"]}>
        <section className={section} aria-labelledby="select-course-heading">
          <h2 id="select-course-heading" className="text-xl font-semibold">
            {t("select")}
          </h2>
          <PreferencesForm
            key={snapshot.profileVersion}
            snapshot={snapshot}
            locale={locale}
            courseOnly
            courseChoices={courseChoiceLabels(locale, snapshot.courses)}
            returnToToday
          />
        </section>
        <section className={section} aria-labelledby="new-course-heading">
          <h2 id="new-course-heading" className="text-xl font-semibold">
            {t("new")}
          </h2>
          <p className="text-sm text-(--color-ink-muted)">{t("empty")}</p>
          <CreateCourseForm
            locale={locale}
            profileVersion={snapshot.profileVersion}
            languages={languages}
          />
        </section>
      </ClientMessages>
    </main>
  );
}
