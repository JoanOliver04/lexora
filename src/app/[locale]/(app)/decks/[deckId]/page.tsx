import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { parseDeckDetailQuery, readDeckDetail } from "@/modules/library/application/deck-detail";
import { Button, Input, Label } from "@/shared/presentation/components";

import {
  linkConceptToDeckAction,
  setDeckArchivedAction,
  unlinkConceptFromDeckAction,
} from "../actions";
import { EditDeckForm } from "../edit-deck-form";
import { DeckDetailNavigation } from "../deck-detail-navigation";
import { deckDetailParams } from "../deck-detail-query";

/**
 * Detalle y edición de un mazo (LEX-3.5).
 *
 * One owner-bound read returns the deck, exact counts and bounded pages.
 * Archived decks remain readable for editing/restoration.
 *
 * Misma puerta de onboarding por página que la lista (deuda anotada).
 *
 * Vincular y quitar conceptos sigue usando los casos de uso de biblioteca;
 * buscar o paginar solo consulta y no modifica las relaciones.
 */
export default async function DeckDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; deckId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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

  const query = parseDeckDetailQuery(await searchParams);
  const detail = await readDeckDetail(
    context.deckDetails,
    context.ownerId,
    activeCourse.id,
    deckId,
    query,
  );
  if (!detail) {
    notFound();
  }

  const { deck, members: linked, available } = detail;
  const memberPage = Math.floor(linked.offset / detail.pageSize) + 1;
  const availablePage = Math.floor(available.offset / detail.pageSize) + 1;
  const linkQuery = deckDetailParams(query, memberPage, availablePage);
  const returnQuery = new URLSearchParams(linkQuery).toString();

  const t = await getTranslations("Library");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-8 px-6 py-12 [overflow-wrap:anywhere]">
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
          {t("conceptCount", { count: detail.memberCount })}
        </p>

        <form
          method="get"
          aria-label={t("memberSearchLabel")}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="available" value={query.availableSearch} />
          <input type="hidden" name="availablePage" value={String(availablePage)} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="deck-member-search">{t("memberSearchLabel")}</Label>
            <Input
              id="deck-member-search"
              name="members"
              type="search"
              maxLength={200}
              defaultValue={query.memberSearch}
            />
          </div>
          <Button type="submit" variant="secondary">
            {t("detailSearchSubmit")}
          </Button>
        </form>

        {linked.items.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">
            {t(query.memberSearch ? "memberSearchEmpty" : "emptyDeckConcepts")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {linked.items.map((concept) => (
              <li
                key={concept.id}
                className="flex items-center justify-between gap-3 rounded-(--radius-control) border border-(--color-border) px-3 py-2"
              >
                <span className="text-sm">{concept.title}</span>
                <form action={unlinkConceptFromDeckAction} className="shrink-0">
                  <input type="hidden" name="returnQuery" value={returnQuery} />
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
        <DeckDetailNavigation
          deckId={deck.id}
          result={linked}
          pageSize={detail.pageSize}
          pageKey="memberPage"
          query={linkQuery}
          label={t("membersPaginationLabel")}
        />

        <h3 className="pt-3 font-medium">{t("availableHeading")}</h3>
        <form
          method="get"
          aria-label={t("availableSearchLabel")}
          className="flex flex-wrap items-end gap-3"
        >
          <input type="hidden" name="members" value={query.memberSearch} />
          <input type="hidden" name="memberPage" value={String(memberPage)} />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Label htmlFor="deck-available-search">{t("availableSearchLabel")}</Label>
            <Input
              id="deck-available-search"
              name="available"
              type="search"
              maxLength={200}
              defaultValue={query.availableSearch}
            />
          </div>
          <Button type="submit" variant="secondary">
            {t("detailSearchSubmit")}
          </Button>
        </form>

        {available.items.length > 0 ? (
          <form action={linkConceptToDeckAction} className="flex flex-wrap items-end gap-3 pt-2">
            <input type="hidden" name="returnQuery" value={returnQuery} />
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="deckId" value={deck.id} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
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
                className="w-full min-w-0 max-w-full min-h-11 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)"
              >
                {available.items.map((concept) => (
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
          <p className="text-sm text-(--color-ink-subtle)">
            {t(query.availableSearch ? "availableSearchEmpty" : "linkConceptEmpty")}
          </p>
        )}
        <DeckDetailNavigation
          deckId={deck.id}
          result={available}
          pageSize={detail.pageSize}
          pageKey="availablePage"
          query={linkQuery}
          label={t("availablePaginationLabel")}
        />
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
