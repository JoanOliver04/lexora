import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { getFreeStudyContextForCurrentUser } from "@/composition/study";
import { ClientMessages } from "@/i18n/client-messages";
import { Link } from "@/i18n/navigation";
import { studyScopeFromQuery } from "@/modules/study/domain/study-scope";

import { FreeStudyView } from "./free-study-view";

export default async function FreeStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ deck?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  if (!(await hasCompletedOnboardingForCurrentUser())) redirect(`/${locale}/onboarding`);
  const context = await getFreeStudyContextForCurrentUser();
  if (!context) redirect(`/${locale}/app`);
  const [t, decks] = await Promise.all([getTranslations("FreeStudy"), context.listDecks()]);
  const scope = studyScopeFromQuery((await searchParams).deck);
  const activeIds = new Set(decks.map(({ id }) => id));
  const valid =
    scope !== null && (scope.deckIds === null || scope.deckIds.every((id) => activeIds.has(id)));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-5 px-[clamp(12px,4vw,24px)] py-8 sm:py-12">
      <Link
        href={
          valid && scope?.deckIds
            ? { pathname: "/app/study", query: { deck: scope.deckIds } }
            : "/app/study"
        }
        className="inline-flex min-h-11 w-fit items-center text-sm text-(--color-accent) underline underline-offset-4"
      >
        {t("back")}
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      {valid ? (
        <ClientMessages namespaces={["FreeStudy", "PracticeCard", "StudyDeckPicker", "Eoi"]}>
          <FreeStudyView
            key={`${context.courseId}:${scope.deckIds?.join(",") ?? "all"}`}
            courseId={context.courseId}
            decks={decks}
            initialDeckIds={scope.deckIds}
          />
        </ClientMessages>
      ) : (
        <div>
          <p>{t("scopeUnavailable")}</p>
          <Link
            href="/app/study/free"
            className="inline-flex min-h-11 items-center text-(--color-accent) underline"
          >
            {t("chooseAgain")}
          </Link>
        </div>
      )}
    </main>
  );
}
