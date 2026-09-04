import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { listConcepts } from "@/modules/library/application/concept";
import { listDeckConcepts, listDecks } from "@/modules/library/application/deck";
import { Button } from "@/shared/presentation/components";

import {
  linkConceptToDeckAction,
  setDeckArchivedAction,
  unlinkConceptFromDeckAction,
} from "../actions";
import { EditDeckForm } from "../edit-deck-form";

/**
 * Detalle y edición de un mazo (LEX-3.5).
 *
 * `DeckRepository` no tiene un `get` por id (LEX-3.4): se lee la lista completa
 * —incluidos los archivados, para poder editar y restaurar uno archivado— y se
 * busca. Con los pocos mazos de un curso en la V1 es asumible; un `get`
 * dedicado se añadiría si LEX-3.9 lo pide.
 *
 * Misma puerta de onboarding por página que la lista (deuda anotada).
 *
 * **Vincular conceptos a este mazo vive aquí** (LEX-3.6), no en el detalle de
 * concepto: esta página ya lee `listDeckConcepts` de un mazo concreto barato;
 * hacerlo al revés («mazos que contienen este concepto») exigiría un método
 * nuevo en `DeckRepository` sin caso de uso que lo pida todavía.
 */
export default async function DeckDetailPage({
  params,
}: {
  params: Promise<{ locale: string; deckId: string }>;
}) {
  const { locale, deckId } = await params;
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

  const decks = await listDecks(context.decks, context.ownerId, activeCourse.id, {
    includeArchived: true,
  });
  const deck = decks.find((candidate) => candidate.id === deckId);
  if (!deck) {
    notFound();
  }

  const linked = await listDeckConcepts(context.decks, context.ownerId, deck.id);
  const linkedIds = new Set(linked.map((item) => item.concept.id));
  const courseConcepts = await listConcepts(context.concepts, context.ownerId, activeCourse.id);
  const available = courseConcepts.filter((concept) => !linkedIds.has(concept.id));

  const t = await getTranslations("Library");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link
          href="/decks"
          className="text-sm text-(--color-ink-muted) underline underline-offset-4"
        >
          {t("detailBack")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("editHeading")}</h1>
        {deck.archivedAt ? (
          <p className="text-sm text-(--color-ink-subtle)">{t("archivedBadge")}</p>
        ) : null}
      </header>

      <EditDeckForm locale={locale} deck={deck} />

      <section className="flex flex-col gap-3 border-t border-(--color-border) pt-8">
        <h2 className="text-lg font-medium">{t("conceptsHeading")}</h2>
        <p className="text-sm text-(--color-ink-muted)">
          {t("conceptCount", { count: linked.length })}
        </p>

        {linked.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">{t("emptyDeckConcepts")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linked.map(({ concept }) => (
              <li
                key={concept.id}
                className="flex items-center justify-between gap-3 rounded-(--radius-control) border border-(--color-border) px-3 py-2"
              >
                <span className="text-sm">{concept.title}</span>
                <form action={unlinkConceptFromDeckAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="deckId" value={deck.id} />
                  <input type="hidden" name="conceptId" value={concept.id} />
                  <Button type="submit" variant="secondary">
                    {t("unlinkConceptButton")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {available.length > 0 ? (
          <form action={linkConceptToDeckAction} className="flex flex-wrap items-end gap-3 pt-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="deckId" value={deck.id} />
            <div className="flex flex-col gap-2">
              <label
                htmlFor="link-concept"
                className="text-sm font-medium text-(--color-ink-muted)"
              >
                {t("linkConceptLabel")}
              </label>
              <select
                id="link-concept"
                name="conceptId"
                required
                className="w-full min-h-11 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)"
              >
                {available.map((concept) => (
                  <option key={concept.id} value={concept.id}>
                    {concept.title}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              {t("linkConceptButton")}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-(--color-ink-subtle)">{t("linkConceptEmpty")}</p>
        )}
      </section>

      <form action={setDeckArchivedAction} className="border-t border-(--color-border) pt-8">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="deckId" value={deck.id} />
        <input type="hidden" name="archived" value={deck.archivedAt ? "0" : "1"} />
        <Button type="submit" variant="secondary">
          {deck.archivedAt ? t("actions.restore") : t("actions.archive")}
        </Button>
      </form>
    </main>
  );
}
