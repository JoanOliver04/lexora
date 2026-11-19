import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { getFreeStudyContextForCurrentUser } from "@/composition/study";
import { ClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";

import { FreeStudyView } from "./free-study-view";

export default async function FreeStudyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await hasCompletedOnboardingForCurrentUser())) redirect(`/${locale}/onboarding`);
  const context = await getFreeStudyContextForCurrentUser();
  if (!context) redirect(`/${locale}/app`);
  const [t, decks] = await Promise.all([getTranslations("FreeStudy"), context.listDecks()]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-[clamp(12px,4vw,24px)] py-8 sm:py-12">
      <Link
        href="/app/study"
        className="inline-flex min-h-11 w-fit items-center text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <ClientMessages namespaces={["FreeStudy", "PracticeCard"]}>
        <FreeStudyView courseId={context.courseId} decks={decks} />
      </ClientMessages>
    </main>
  );
}
