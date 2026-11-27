import { notFound, redirect } from "next/navigation";
import { eoiDeckForKey } from "@/composition/eoi";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { getConcept } from "@/modules/library/application/concept";
import { getPracticeItem } from "@/modules/library/application/practice-item";
import { Button } from "@/shared/presentation/components";

import { setPracticeItemArchivedAction } from "../../../actions";
import { EditPracticeItemForm } from "../../../edit-practice-item-form";
import { practiceItemOrigin } from "../../../concept-options-query";
import { PracticeItemPreview } from "./practice-item-preview";

/**
 * Edición de un ítem de práctica (LEX-3.7), con su previsualización
 * (LEX-3.11). La biblioteca lee el ítem por su identificador y concepto.
 * El origen determina a dónde se vuelve al guardar o cancelar la edición.
 */
export default async function PracticeItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; conceptId: string; itemId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, conceptId, itemId } = await params;
  setRequestLocale(locale);

  if (!(await hasCompletedOnboardingForCurrentUser())) {
    redirect(`/${locale}/onboarding`);
  }

  const activeCourse = await getActiveCourseForCurrentUser();
  if (!activeCourse) {
    redirect(`/${locale}/onboarding`);
  }

  const context = await getLibraryContextForCurrentUser();
  if (!context) {
    redirect(`/${locale}/login`);
  }

  const concept = await getConcept(context.concepts, context.ownerId, conceptId);
  if (!concept || concept.courseId !== activeCourse.id) {
    notFound();
  }

  const item = await getPracticeItem(context.practiceItems, context.ownerId, conceptId, itemId);
  if (!item) {
    notFound();
  }

  const origin = practiceItemOrigin(conceptId, await searchParams);
  if (item.config.exercise && item.config.pack) {
    const deck = await eoiDeckForKey(item.config.pack);
    if (deck)
      redirect(
        "/" +
          locale +
          "/import/eoi?" +
          new URLSearchParams({
            deck,
            card: item.config.exercise.key,
            ...(origin.sessionId ? { fromStudy: origin.sessionId } : {}),
          }),
      );
  }
  const t = await getTranslations("Concepts");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href={origin.href}
          prefetch={false}
          className="text-sm text-(--color-ink-muted) underline underline-offset-4"
        >
          {t(origin.sessionId ? "items.backToReview" : "items.backToConcept")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("items.editHeading")}</h1>
        {item.archivedAt ? (
          <p className="text-sm text-(--color-ink-subtle)">{t("items.archivedBadge")}</p>
        ) : null}
      </header>

      <PracticeItemPreview item={item} />

      <EditPracticeItemForm
        locale={locale}
        conceptId={conceptId}
        item={item}
        returnQuery={origin.returnQuery}
      />

      <form
        action={setPracticeItemArchivedAction}
        className="border-t border-(--color-border) pt-8"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="conceptId" value={conceptId} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="returnQuery" value={origin.returnQuery} />
        <input type="hidden" name="archived" value={item.archivedAt ? "0" : "1"} />
        <Button type="submit" variant="secondary">
          {item.archivedAt ? t("items.actions.restore") : t("items.actions.archive")}
        </Button>
      </form>
    </main>
  );
}
