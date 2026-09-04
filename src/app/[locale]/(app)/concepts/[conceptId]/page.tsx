import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { getConcept } from "@/modules/library/application/concept";
import { listPracticeItems } from "@/modules/library/application/practice-item";
import { listConceptTags } from "@/modules/library/application/tag";
import { canReverse } from "@/modules/library/domain/practice-item";
import { Button } from "@/shared/presentation/components";

import { detachTagAction, reversePracticeItemAction, setConceptArchivedAction } from "../actions";
import { AddTagForm } from "../add-tag-form";
import { CreatePracticeItemForm } from "../create-practice-item-form";
import { EditConceptForm } from "../edit-concept-form";

/**
 * Detalle y edición de un concepto (LEX-3.6). A diferencia del detalle de mazo
 * (LEX-3.5, sin `get` en el puerto), `ConceptRepository.get` sí existe desde
 * LEX-3.4: se usa directamente en vez de leer la lista completa y filtrar.
 *
 * Vincular el concepto a un mazo **no** vive aquí: `DeckRepository` no tiene
 * una consulta inversa («mazos que contienen este concepto»), y añadir una
 * solo para esta pantalla sería alcance inventado. La pertenencia se gestiona
 * desde el detalle del mazo (`decks/[deckId]/page.tsx`), que ya lee
 * `listDeckConcepts` de ese mazo concreto.
 */
export default async function ConceptDetailPage({
  params,
}: {
  params: Promise<{ locale: string; conceptId: string }>;
}) {
  const { locale, conceptId } = await params;
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

  const tags = await listConceptTags(context.tags, context.ownerId, concept.id);
  const items = await listPracticeItems(context.practiceItems, context.ownerId, concept.id, {
    includeArchived: true,
  });
  const t = await getTranslations("Concepts");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/concepts"
          className="text-sm text-(--color-ink-muted) underline underline-offset-4"
        >
          {t("detailBack")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("editHeading")}</h1>
        {concept.archivedAt ? (
          <p className="text-sm text-(--color-ink-subtle)">{t("archivedBadge")}</p>
        ) : null}
      </header>

      <EditConceptForm locale={locale} concept={concept} />

      <section className="flex flex-col gap-3 border-t border-(--color-border) pt-8">
        <h2 className="text-lg font-medium">{t("tags.heading")}</h2>
        {tags.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">{t("tags.empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <li key={tag.id}>
                <form
                  action={detachTagAction}
                  className="flex items-center gap-1 rounded-full border border-(--color-border) py-0.5 pr-1 pl-2 text-xs"
                >
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="conceptId" value={concept.id} />
                  <input type="hidden" name="tagId" value={tag.id} />
                  <span>{tag.displayName}</span>
                  <button
                    type="submit"
                    className="text-(--color-ink-subtle) hover:text-(--color-danger)"
                    aria-label={`${t("tags.removeButton")}: ${tag.displayName}`}
                  >
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <AddTagForm locale={locale} conceptId={concept.id} />
      </section>

      <section className="flex flex-col gap-3 border-t border-(--color-border) pt-8">
        <h2 className="text-lg font-medium">{t("items.heading")}</h2>
        {items.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">{t("items.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-(--radius-control) border border-(--color-border) p-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs text-(--color-ink-subtle)">
                    {t(`items.modes.${item.mode}`)}
                  </span>
                  {item.archivedAt ? (
                    <span className="text-xs text-(--color-ink-subtle)">
                      {t("items.archivedBadge")}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm">
                  {item.promptText} → {item.answerText}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href={`/concepts/${concept.id}/items/${item.id}`}
                    className="text-sm underline underline-offset-4"
                  >
                    {t("items.actions.edit")}
                  </Link>
                  {!item.archivedAt && canReverse(item.mode) ? (
                    <form action={reversePracticeItemAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="conceptId" value={concept.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <Button type="submit" variant="secondary">
                        {t("items.actions.reverse")}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <CreatePracticeItemForm locale={locale} conceptId={concept.id} />
      </section>

      <form action={setConceptArchivedAction} className="border-t border-(--color-border) pt-8">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="conceptId" value={concept.id} />
        <input type="hidden" name="archived" value={concept.archivedAt ? "0" : "1"} />
        <Button type="submit" variant="secondary">
          {concept.archivedAt ? t("actions.restore") : t("actions.archive")}
        </Button>
      </form>
    </main>
  );
}
