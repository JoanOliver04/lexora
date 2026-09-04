import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { listDeckConcepts, listDecks } from "@/modules/library/application/deck";
import { Button } from "@/shared/presentation/components";

import { setDeckArchivedAction } from "../actions";
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

  const conceptCount = (await listDeckConcepts(context.decks, context.ownerId, deck.id)).length;
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
        {conceptCount === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">{t("emptyDeckConcepts")}</p>
        ) : (
          <p className="text-sm text-(--color-ink-muted)">
            {t("conceptCount", { count: conceptCount })}
          </p>
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
