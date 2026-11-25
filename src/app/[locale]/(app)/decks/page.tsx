import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { countConceptsPerDeck, searchDecks } from "@/modules/library/application/deck";
import { CEFR_LEVELS, DECK_CATEGORIES } from "@/modules/library/domain/taxonomy";
import { Button, Input, Label } from "@/shared/presentation/components";
import {
  CollectionEmpty,
  CollectionPagination,
  CollectionResults,
} from "@/shared/presentation/components/collection-tools";
import {
  collectionPageQuery,
  withoutCollectionFilter,
  COLLECTION_PAGE_SIZE as PAGE_SIZE,
  MAX_COLLECTION_SEARCH_LENGTH,
  type QueryValue,
} from "@/shared/presentation/library-query";

import { setDeckArchivedAction, moveDeckAction } from "./actions";
import { CreateDeckForm } from "./create-deck-form";
import { deckListQuery } from "./deck-list-query";
import { PendingButton } from "../../(auth)/_components/pending-button";

/**
 * Lista de mazos del curso activo (LEX-3.5, búsqueda/filtros/paginación
 * LEX-3.9), primera pantalla visible de la biblioteca.
 *
 * La puerta de onboarding sigue por página (deuda anotada en `STATUS.md` desde
 * LEX-2.9).
 *
 * Búsqueda por `ilike` sobre el título, filtro por categoría/nivel y
 * paginación por `limit`/`offset` — todo delegado en `searchDecks`, que
 * también resuelve el recuento de conceptos vivos por mazo en una sola
 * consulta (`countConceptsPerDeck`), ya no un `listDeckConcepts` por mazo (N+1
 * anotado en LEX-3.5/3.6). El formulario de búsqueda es un `<form
 * method="get">` sin JavaScript: navega con la query string, coherente con que
 * el resto de la pantalla ya funciona sin cliente.
 *
 * Reordenar («Subir»/«Bajar») solo tiene sentido sobre el orden completo y sin
 * filtrar: con búsqueda, filtro o más de una página activos, los botones se
 * ocultan — moverían una fila respecto de vecinos que no son los reales.
 * `moveDeckAction` sigue leyendo el orden completo por su cuenta (LEX-3.5), así
 * que no hace falta paginar esa lectura interna.
 */
export default async function DecksPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    archived?: QueryValue;
    q?: QueryValue;
    category?: QueryValue;
    cefrLevel?: QueryValue;
    page?: QueryValue;
  }>;
}) {
  const { locale } = await params;
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

  const listQuery = deckListQuery(await searchParams);
  const { q: search, category, cefrLevel } = listQuery;
  const includeArchived = listQuery.archived === "1";
  const page = Number(listQuery.page ?? 1);
  const offset = (page - 1) * PAGE_SIZE;
  const filterQuery = withoutCollectionFilter(listQuery, "archived");
  const baseQuery = withoutCollectionFilter(listQuery, "page");
  const returnQuery = new URLSearchParams(listQuery).toString();

  const { items: decks, total } = await searchDecks(
    context.decks,
    context.ownerId,
    activeCourse.id,
    {
      includeArchived,
      search,
      category,
      cefrLevel,
      limit: PAGE_SIZE,
      offset,
    },
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pageCount) {
    const query = new URLSearchParams(collectionPageQuery(baseQuery, pageCount));
    redirect(`/${locale}/decks${query.size ? `?${query}` : ""}`);
  }
  const counts = await countConceptsPerDeck(
    context.decks,
    context.ownerId,
    decks.map((deck) => deck.id),
  );

  const t = await getTranslations("Library");
  const collection = await getTranslations("Collection");
  const isFiltered = Boolean(search || category || cefrLevel);
  const reorderable = !isFiltered && !includeArchived && total <= PAGE_SIZE;
  const filters = [
    ...(search ? [{ key: "q", label: search }] : []),
    ...(category ? [{ key: "category", label: t(`categories.${category}`) }] : []),
    ...(cefrLevel ? [{ key: "cefrLevel", label: cefrLevel }] : []),
    ...(includeArchived ? [{ key: "archived", label: collection("archived") }] : []),
  ];

  return (
    <main className="collection-page">
      <header className="collection-header">
        <Link href="/app" className="text-sm text-(--color-ink-muted) underline underline-offset-4">
          {t("backToApp")}
        </Link>
        <div className="collection-heading">
          <div>
            <h1>{t("decksTitle")}</h1>
            <p>{t("decksIntro")}</p>
          </div>
          <Link
            href={{ pathname: "/decks", query: listQuery, hash: "new-deck" }}
            className="collection-action"
          >
            {t("createHeading")}
          </Link>
        </div>
      </header>

      <div className="collection-layout">
        <section className="collection-list" aria-labelledby="collection-list-heading">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="collection-list-heading" className="text-lg font-medium">
              {t("listHeading")}
            </h2>
            {includeArchived ? (
              <Link
                href={{ pathname: "/decks", query: filterQuery }}
                className="text-sm text-(--color-ink-muted) underline underline-offset-4"
              >
                {t("hideArchived")}
              </Link>
            ) : (
              <Link
                href={{ pathname: "/decks", query: { ...filterQuery, archived: "1" } }}
                className="text-sm text-(--color-ink-muted) underline underline-offset-4"
              >
                {t("showArchived")}
              </Link>
            )}
          </div>

          <form method="get" className="collection-toolbar">
            <div className="collection-field">
              <Label htmlFor="deck-search-q">{t("search.label")}</Label>
              <Input
                id="deck-search-q"
                name="q"
                type="search"
                maxLength={MAX_COLLECTION_SEARCH_LENGTH}
                placeholder={t("search.placeholder")}
                defaultValue={search ?? ""}
              />
            </div>
            <div className="collection-field">
              <Label htmlFor="deck-search-category">{t("filters.categoryLabel")}</Label>
              <select
                id="deck-search-category"
                name="category"
                defaultValue={category ?? ""}
                className="min-h-11 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)"
              >
                <option value="">{t("filters.categoryAll")}</option>
                {DECK_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {t(`categories.${option}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="collection-field">
              <Label htmlFor="deck-search-level">{t("filters.levelLabel")}</Label>
              <select
                id="deck-search-level"
                name="cefrLevel"
                defaultValue={cefrLevel ?? ""}
                className="min-h-11 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)"
              >
                <option value="">{t("filters.levelAll")}</option>
                {CEFR_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            {includeArchived ? <input type="hidden" name="archived" value="1" /> : null}
            <Button type="submit" variant="secondary">
              {t("search.submit")}
            </Button>
            {isFiltered || includeArchived ? (
              <Link
                href="/decks"
                className="text-sm text-(--color-ink-muted) underline underline-offset-4"
              >
                {t("search.clear")}
              </Link>
            ) : null}
          </form>

          <CollectionResults
            pathname="/decks"
            query={baseQuery}
            filters={filters}
            total={total}
            page={page}
          />
          {decks.length === 0 ? (
            <CollectionEmpty
              pathname="/decks"
              filtered={isFiltered || includeArchived}
              message={
                total === 0 && !isFiltered && !includeArchived ? t("emptyDecks") : t("noResults")
              }
            />
          ) : (
            <ul className="collection-items">
              {decks.map((deck, index) => (
                <li key={deck.id} className="collection-item">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link
                      id={`deck-title-${deck.id}`}
                      href={{ pathname: `/decks/${deck.id}`, query: listQuery }}
                      className="collection-item-title"
                    >
                      {deck.title}
                    </Link>
                    {deck.category ? (
                      <span className="collection-badge">{t(`categories.${deck.category}`)}</span>
                    ) : null}
                    {deck.cefrLevel ? (
                      <span className="collection-badge">{deck.cefrLevel}</span>
                    ) : null}
                    {deck.archivedAt ? (
                      <span className="text-xs text-(--color-ink-subtle)">
                        {t("archivedBadge")}
                      </span>
                    ) : null}
                  </div>

                  <Link
                    href={{
                      pathname: `/decks/${deck.id}`,
                      query: listQuery,
                      hash: "deck-concepts",
                    }}
                    aria-describedby={`deck-title-${deck.id}`}
                    prefetch={false}
                    className="inline-flex min-h-11 w-fit items-center text-sm text-(--color-ink-muted) underline underline-offset-4"
                  >
                    {t("conceptCount", { count: counts[deck.id] ?? 0 })}
                  </Link>

                  <div className="flex flex-wrap gap-2">
                    {reorderable && !deck.archivedAt ? (
                      <>
                        <form action={moveDeckAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="deckId" value={deck.id} />
                          <input type="hidden" name="direction" value="up" />
                          <PendingButton
                            idle={t("actions.moveUp")}
                            pending={collection("saving")}
                            variant="secondary"
                            disabled={index === 0}
                          />
                        </form>
                        <form action={moveDeckAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="deckId" value={deck.id} />
                          <input type="hidden" name="direction" value="down" />
                          <PendingButton
                            idle={t("actions.moveDown")}
                            pending={collection("saving")}
                            variant="secondary"
                            disabled={index === decks.length - 1}
                          />
                        </form>
                      </>
                    ) : null}
                    <form action={setDeckArchivedAction}>
                      <input type="hidden" name="returnQuery" value={returnQuery} />
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="deckId" value={deck.id} />
                      <input type="hidden" name="archived" value={deck.archivedAt ? "0" : "1"} />
                      <PendingButton
                        idle={deck.archivedAt ? t("actions.restore") : t("actions.archive")}
                        pending={collection("saving")}
                        variant="secondary"
                      />
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <CollectionPagination pathname="/decks" query={baseQuery} page={page} pages={pageCount} />
        </section>

        <section id="new-deck" tabIndex={-1} className="collection-create">
          <h2 className="text-lg font-medium">{t("createHeading")}</h2>
          <CreateDeckForm key={activeCourse.id} locale={locale} courseId={activeCourse.id} />
        </section>
      </div>
    </main>
  );
}
