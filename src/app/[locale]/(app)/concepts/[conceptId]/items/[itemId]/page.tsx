import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { getConcept } from "@/modules/library/application/concept";
import { listPracticeItems } from "@/modules/library/application/practice-item";
import { Button } from "@/shared/presentation/components";

import { setPracticeItemArchivedAction } from "../../../actions";
import { EditPracticeItemForm } from "../../../edit-practice-item-form";

/**
 * Edición de un ítem de práctica (LEX-3.7). `PracticeItemRepository` no tiene
 * `get` (LEX-3.4): se lee la lista del concepto —incluidos los archivados— y
 * se busca por id, como el detalle de mazo (LEX-3.5).
 */
export default async function PracticeItemDetailPage({
  params,
}: {
  params: Promise<{ locale: string; conceptId: string; itemId: string }>;
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

  const items = await listPracticeItems(context.practiceItems, context.ownerId, conceptId, {
    includeArchived: true,
  });
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) {
    notFound();
  }

  const t = await getTranslations("Concepts");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href={`/concepts/${conceptId}`}
          className="text-sm text-(--color-ink-muted) underline underline-offset-4"
        >
          {t("items.backToConcept")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("items.editHeading")}</h1>
        {item.archivedAt ? (
          <p className="text-sm text-(--color-ink-subtle)">{t("items.archivedBadge")}</p>
        ) : null}
      </header>

      <EditPracticeItemForm locale={locale} conceptId={conceptId} item={item} />

      <form
        action={setPracticeItemArchivedAction}
        className="border-t border-(--color-border) pt-8"
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="conceptId" value={conceptId} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="archived" value={item.archivedAt ? "0" : "1"} />
        <Button type="submit" variant="secondary">
          {item.archivedAt ? t("items.actions.restore") : t("items.actions.archive")}
        </Button>
      </form>
    </main>
  );
}
