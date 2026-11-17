import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { searchConcepts } from "@/modules/library/application/concept";
import { readTagPreviews } from "@/modules/library/application/library-options";
import {
  CEFR_LEVELS,
  CONCEPT_KINDS,
  type CefrLevel,
  type ConceptKind,
} from "@/modules/library/domain/taxonomy";
import { Button, Input, Label } from "@/shared/presentation/components";
import {
  CollectionEmpty,
  CollectionPagination,
  CollectionResults,
} from "@/shared/presentation/components/collection-tools";
import {
  collectionPage,
  collectionPageQuery,
  collectionSearch,
  queryValue,
  COLLECTION_PAGE_SIZE as PAGE_SIZE,
  MAX_COLLECTION_SEARCH_LENGTH,
  type QueryValue,
} from "@/shared/presentation/library-query";

import { setConceptArchivedAction } from "./actions";
import { CreateConceptForm } from "./create-concept-form";
import { PendingButton } from "../../(auth)/_components/pending-button";

function parseKind(value: string | undefined): ConceptKind | undefined {
  return CONCEPT_KINDS.includes(value as ConceptKind) ? (value as ConceptKind) : undefined;
}

function parseCefrLevel(value: string | undefined): CefrLevel | undefined {
  return CEFR_LEVELS.includes(value as CefrLevel) ? (value as CefrLevel) : undefined;
}

/**
 * Lista de conceptos del curso activo (LEX-3.6, búsqueda/filtros/paginación
 * LEX-3.9), segunda pantalla de la biblioteca. Mismo patrón que
 * `decks/page.tsx`: `<form method="get">` sin JavaScript, `searchConcepts`
 * resuelve texto/tipo/nivel/paginación, `listTagsForConcepts` sustituye el
 * `listConceptTags` por concepto (N+1 anotado en LEX-3.6) por una consulta
 * agrupada.
 */
export default async function ConceptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    archived?: QueryValue;
    q?: QueryValue;
    kind?: QueryValue;
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

  const sp = await searchParams;
  const includeArchived = queryValue(sp.archived) === "1";
  const search = collectionSearch(sp.q);
  const kind = parseKind(queryValue(sp.kind));
  const cefrLevel = parseCefrLevel(queryValue(sp.cefrLevel));
  const page = collectionPage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;
  const filterQuery: Record<string, string> = {
    ...(search ? { q: search } : {}),
    ...(kind ? { kind } : {}),
    ...(cefrLevel ? { cefrLevel } : {}),
  };
  const baseQuery = includeArchived ? { ...filterQuery, archived: "1" } : filterQuery;

  const { items: concepts, total } = await searchConcepts(
    context.concepts,
    context.ownerId,
    activeCourse.id,
    { includeArchived, search, kind, cefrLevel, limit: PAGE_SIZE, offset },
  );
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > pageCount) {
    const query = new URLSearchParams(collectionPageQuery(baseQuery, pageCount));
    redirect(`/${locale}/concepts${query.size ? `?${query}` : ""}`);
  }
  const previews = await readTagPreviews(context.options, {
    ownerId: context.ownerId,
    conceptIds: concepts.map((concept) => concept.id),
  });
  const tagsByConcept = Object.fromEntries(previews.map((p) => [p.conceptId, p.items]));
  const tagTotals = Object.fromEntries(previews.map((p) => [p.conceptId, p.total]));

  const t = await getTranslations("Concepts");
  const collection = await getTranslations("Collection");
  const isFiltered = Boolean(search || kind || cefrLevel);
  const filters = [
    ...(search ? [{ key: "q", label: search }] : []),
    ...(kind ? [{ key: "kind", label: t(`kinds.${kind}`) }] : []),
    ...(cefrLevel ? [{ key: "cefrLevel", label: cefrLevel }] : []),
    ...(includeArchived ? [{ key: "archived", label: collection("archived") }] : []),
  ];

  return (
    <main className="collection-page">
      <header className="collection-header">
        <Link
          href="/app"
          className="inline-flex min-h-11 min-w-11 items-center text-sm text-(--color-ink-muted) underline underline-offset-4"
        >
          {t("backToApp")}
        </Link>
        <div className="collection-heading">
          <div>
            <h1>{t("listTitle")}</h1>
            <p>{t("listIntro")}</p>
          </div>
          <Link href="/concepts#new-concept" className="collection-action">
            {t("createHeading")}
          </Link>
        </div>
      </header>

      <div className="collection-layout">
        <section className="collection-list" aria-label={t("listTitle")}>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-4">
            <h2 className="text-lg font-medium">{t("listHeading")}</h2>
            {includeArchived ? (
              <Link
                href={{ pathname: "/concepts", query: filterQuery }}
                className="inline-flex min-h-11 min-w-11 items-center text-sm text-(--color-ink-muted) underline underline-offset-4"
              >
                {t("hideArchived")}
              </Link>
            ) : (
              <Link
                href={{ pathname: "/concepts", query: { ...filterQuery, archived: "1" } }}
                className="inline-flex min-h-11 min-w-11 items-center text-sm text-(--color-ink-muted) underline underline-offset-4"
              >
                {t("showArchived")}
              </Link>
            )}
          </div>

          <form method="get" className="collection-toolbar">
            <div className="collection-field">
              <Label htmlFor="concept-search-q">{t("search.label")}</Label>
              <Input
                id="concept-search-q"
                name="q"
                type="search"
                maxLength={MAX_COLLECTION_SEARCH_LENGTH}
                placeholder={t("search.placeholder")}
                defaultValue={search ?? ""}
              />
            </div>
            <div className="collection-field">
              <Label htmlFor="concept-search-kind">{t("filters.kindLabel")}</Label>
              <select
                id="concept-search-kind"
                name="kind"
                defaultValue={kind ?? ""}
                className="min-h-11 w-full min-w-0 max-w-full rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)"
              >
                <option value="">{t("filters.kindAll")}</option>
                {CONCEPT_KINDS.map((option) => (
                  <option key={option} value={option}>
                    {t(`kinds.${option}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="collection-field">
              <Label htmlFor="concept-search-level">{t("filters.levelLabel")}</Label>
              <select
                id="concept-search-level"
                name="cefrLevel"
                defaultValue={cefrLevel ?? ""}
                className="min-h-11 w-full min-w-0 max-w-full rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)"
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
                href="/concepts"
                className="inline-flex min-h-11 min-w-11 items-center text-sm text-(--color-ink-muted) underline underline-offset-4"
              >
                {t("search.clear")}
              </Link>
            ) : null}
          </form>

          <CollectionResults
            pathname="/concepts"
            query={baseQuery}
            filters={filters}
            total={total}
            page={page}
          />
          {concepts.length === 0 ? (
            <CollectionEmpty
              pathname="/concepts"
              filtered={isFiltered || includeArchived}
              message={
                total === 0 && !isFiltered && !includeArchived ? t("emptyConcepts") : t("noResults")
              }
            />
          ) : (
            <ul className="collection-items">
              {concepts.map((concept) => (
                <li key={concept.id} className="collection-item">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <Link href={`/concepts/${concept.id}`} className="collection-item-title">
                      {concept.title}
                    </Link>
                    <span className="collection-badge">{t(`kinds.${concept.kind}`)}</span>
                    {concept.cefrLevel ? (
                      <span className="collection-badge">{concept.cefrLevel}</span>
                    ) : null}
                    {concept.archivedAt ? (
                      <span className="text-xs text-(--color-ink-subtle)">
                        {t("archivedBadge")}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-sm text-(--color-ink-muted)">{concept.summary}</p>

                  {(tagsByConcept[concept.id] ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {(tagsByConcept[concept.id] ?? []).map((tag) => (
                        <span
                          key={tag.id}
                          className="rounded-full border border-(--color-border) px-2 py-0.5 text-xs text-(--color-ink-muted)"
                        >
                          {tag.displayName}
                        </span>
                      ))}
                      {(tagTotals[concept.id] ?? 0) > 3 ? (
                        <Link
                          href={`/concepts/${concept.id}`}
                          className="inline-flex min-h-11 min-w-11 items-center text-xs underline"
                        >
                          {t("tags.more", { count: (tagTotals[concept.id] ?? 0) - 3 })}
                        </Link>
                      ) : null}
                    </div>
                  ) : null}

                  <div>
                    <form action={setConceptArchivedAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="conceptId" value={concept.id} />
                      <input type="hidden" name="archived" value={concept.archivedAt ? "0" : "1"} />
                      <PendingButton
                        idle={concept.archivedAt ? t("actions.restore") : t("actions.archive")}
                        pending={collection("saving")}
                        variant="secondary"
                      />
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <CollectionPagination
            pathname="/concepts"
            query={baseQuery}
            page={page}
            pages={pageCount}
          />
        </section>

        <section id="new-concept" tabIndex={-1} className="collection-create">
          <h2 className="text-lg font-medium">{t("createHeading")}</h2>
          <CreateConceptForm locale={locale} />
        </section>
      </div>
    </main>
  );
}
