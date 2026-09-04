import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { countConceptsPerDeck, searchDecks } from "@/modules/library/application/deck";
import {
  CEFR_LEVELS,
  DECK_CATEGORIES,
  type CefrLevel,
  type DeckCategory,
} from "@/modules/library/domain/taxonomy";
import { Button, Input, Label } from "@/shared/presentation/components";

import { setDeckArchivedAction, moveDeckAction } from "./actions";
import { CreateDeckForm } from "./create-deck-form";

const PAGE_SIZE = 20;

function parseCategory(value: string | undefined): DeckCategory | undefined {
  return DECK_CATEGORIES.includes(value as DeckCategory) ? (value as DeckCategory) : undefined;
}

function parseCefrLevel(value: string | undefined): CefrLevel | undefined {
  return CEFR_LEVELS.includes(value as CefrLevel) ? (value as CefrLevel) : undefined;
}

function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

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
    archived?: string;
    q?: string;
    category?: string;
    cefrLevel?: string;
    page?: string;
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

  const sp = await searchParams;
  const includeArchived = sp.archived === "1";
  const search = sp.q?.trim() || undefined;
  const category = parseCategory(sp.category);
  const cefrLevel = parseCefrLevel(sp.cefrLevel);
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

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
  const counts = await countConceptsPerDeck(
    context.decks,
    context.ownerId,
    decks.map((deck) => deck.id),
  );

  const t = await getTranslations("Library");
  const isFiltered = Boolean(search || category || cefrLevel);
  const reorderable = !isFiltered && !includeArchived && total <= PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Sin `archived`: cada enlace decide si lo añade, para no arrastrar
  // `archived: undefined` a la query string.
  const filterQuery = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(category ? { category } : {}),
    ...(cefrLevel ? { cefrLevel } : {}),
  };
  const baseQuery = includeArchived ? { ...filterQuery, archived: "1" } : filterQuery;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/app" className="text-sm text-(--color-ink-muted) underline underline-offset-4">
          {t("backToApp")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("decksTitle")}</h1>
        <p className="text-sm text-(--color-ink-muted)">{t("decksIntro")}</p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">{t("listHeading")}</h2>
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

        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="deck-search-q">{t("search.label")}</Label>
            <Input
              id="deck-search-q"
              name="q"
              type="text"
              placeholder={t("search.placeholder")}
              defaultValue={sp.q ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
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
          <div className="flex flex-col gap-2">
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

        {decks.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">
            {total === 0 && !isFiltered && !includeArchived ? t("emptyDecks") : t("noResults")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {decks.map((deck, index) => (
              <li
                key={deck.id}
                className="flex flex-col gap-2 rounded-(--radius-control) border border-(--color-border) p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/decks/${deck.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {deck.title}
                  </Link>
                  {deck.category ? (
                    <span className="text-xs text-(--color-ink-subtle)">
                      {t(`categories.${deck.category}`)}
                    </span>
                  ) : null}
                  {deck.cefrLevel ? (
                    <span className="text-xs text-(--color-ink-subtle)">{deck.cefrLevel}</span>
                  ) : null}
                  {deck.archivedAt ? (
                    <span className="text-xs text-(--color-ink-subtle)">{t("archivedBadge")}</span>
                  ) : null}
                </div>

                <p className="text-sm text-(--color-ink-muted)">
                  {t("conceptCount", { count: counts[deck.id] ?? 0 })}
                </p>

                <div className="flex flex-wrap gap-2">
                  {reorderable && !deck.archivedAt ? (
                    <>
                      <form action={moveDeckAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="deckId" value={deck.id} />
                        <input type="hidden" name="direction" value="up" />
                        <Button type="submit" variant="secondary" disabled={index === 0}>
                          {t("actions.moveUp")}
                        </Button>
                      </form>
                      <form action={moveDeckAction}>
                        <input type="hidden" name="locale" value={locale} />
                        <input type="hidden" name="deckId" value={deck.id} />
                        <input type="hidden" name="direction" value="down" />
                        <Button
                          type="submit"
                          variant="secondary"
                          disabled={index === decks.length - 1}
                        >
                          {t("actions.moveDown")}
                        </Button>
                      </form>
                    </>
                  ) : null}
                  <form action={setDeckArchivedAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="deckId" value={deck.id} />
                    <input type="hidden" name="archived" value={deck.archivedAt ? "0" : "1"} />
                    <Button type="submit" variant="secondary">
                      {deck.archivedAt ? t("actions.restore") : t("actions.archive")}
                    </Button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-4 text-sm">
            {page > 1 ? (
              <Link
                href={{
                  pathname: "/decks",
                  query: page - 1 > 1 ? { ...baseQuery, page: String(page - 1) } : baseQuery,
                }}
                className="underline underline-offset-4"
              >
                {t("pagination.previous")}
              </Link>
            ) : (
              <span />
            )}
            <span className="text-(--color-ink-muted)">
              {t("pagination.status", { page, pages: pageCount })}
            </span>
            {page < pageCount ? (
              <Link
                href={{ pathname: "/decks", query: { ...baseQuery, page: String(page + 1) } }}
                className="underline underline-offset-4"
              >
                {t("pagination.next")}
              </Link>
            ) : (
              <span />
            )}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 border-t border-(--color-border) pt-8">
        <h2 className="text-lg font-medium">{t("createHeading")}</h2>
        <CreateDeckForm locale={locale} />
      </section>
    </main>
  );
}
