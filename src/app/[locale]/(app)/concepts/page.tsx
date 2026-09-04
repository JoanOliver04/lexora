import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { searchConcepts } from "@/modules/library/application/concept";
import { listTagsForConcepts } from "@/modules/library/application/tag";
import {
  CEFR_LEVELS,
  CONCEPT_KINDS,
  type CefrLevel,
  type ConceptKind,
} from "@/modules/library/domain/taxonomy";
import { Button, Input, Label } from "@/shared/presentation/components";

import { setConceptArchivedAction } from "./actions";
import { CreateConceptForm } from "./create-concept-form";

const PAGE_SIZE = 20;

function parseKind(value: string | undefined): ConceptKind | undefined {
  return CONCEPT_KINDS.includes(value as ConceptKind) ? (value as ConceptKind) : undefined;
}

function parseCefrLevel(value: string | undefined): CefrLevel | undefined {
  return CEFR_LEVELS.includes(value as CefrLevel) ? (value as CefrLevel) : undefined;
}

function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
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
    archived?: string;
    q?: string;
    kind?: string;
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
  const kind = parseKind(sp.kind);
  const cefrLevel = parseCefrLevel(sp.cefrLevel);
  const page = parsePage(sp.page);
  const offset = (page - 1) * PAGE_SIZE;

  const { items: concepts, total } = await searchConcepts(
    context.concepts,
    context.ownerId,
    activeCourse.id,
    { includeArchived, search, kind, cefrLevel, limit: PAGE_SIZE, offset },
  );
  const tagsByConcept = await listTagsForConcepts(
    context.tags,
    context.ownerId,
    concepts.map((concept) => concept.id),
  );

  const t = await getTranslations("Concepts");
  const isFiltered = Boolean(search || kind || cefrLevel);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Sin `archived`: cada enlace decide si lo añade, para no arrastrar
  // `archived: undefined` a la query string.
  const filterQuery = {
    ...(sp.q ? { q: sp.q } : {}),
    ...(kind ? { kind } : {}),
    ...(cefrLevel ? { cefrLevel } : {}),
  };
  const baseQuery = includeArchived ? { ...filterQuery, archived: "1" } : filterQuery;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Link href="/app" className="text-sm text-(--color-ink-muted) underline underline-offset-4">
          {t("backToApp")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("listTitle")}</h1>
        <p className="text-sm text-(--color-ink-muted)">{t("listIntro")}</p>
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">{t("listHeading")}</h2>
          {includeArchived ? (
            <Link
              href={{ pathname: "/concepts", query: filterQuery }}
              className="text-sm text-(--color-ink-muted) underline underline-offset-4"
            >
              {t("hideArchived")}
            </Link>
          ) : (
            <Link
              href={{ pathname: "/concepts", query: { ...filterQuery, archived: "1" } }}
              className="text-sm text-(--color-ink-muted) underline underline-offset-4"
            >
              {t("showArchived")}
            </Link>
          )}
        </div>

        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="concept-search-q">{t("search.label")}</Label>
            <Input
              id="concept-search-q"
              name="q"
              type="text"
              placeholder={t("search.placeholder")}
              defaultValue={sp.q ?? ""}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="concept-search-kind">{t("filters.kindLabel")}</Label>
            <select
              id="concept-search-kind"
              name="kind"
              defaultValue={kind ?? ""}
              className="min-h-11 rounded-(--radius-control) border border-(--color-border-strong) bg-(--color-surface) px-3 text-(--color-ink)"
            >
              <option value="">{t("filters.kindAll")}</option>
              {CONCEPT_KINDS.map((option) => (
                <option key={option} value={option}>
                  {t(`kinds.${option}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="concept-search-level">{t("filters.levelLabel")}</Label>
            <select
              id="concept-search-level"
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
              href="/concepts"
              className="text-sm text-(--color-ink-muted) underline underline-offset-4"
            >
              {t("search.clear")}
            </Link>
          ) : null}
        </form>

        {concepts.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">
            {total === 0 && !isFiltered && !includeArchived ? t("emptyConcepts") : t("noResults")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {concepts.map((concept) => (
              <li
                key={concept.id}
                className="flex flex-col gap-2 rounded-(--radius-control) border border-(--color-border) p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <Link
                    href={`/concepts/${concept.id}`}
                    className="font-medium underline underline-offset-4"
                  >
                    {concept.title}
                  </Link>
                  <span className="text-xs text-(--color-ink-subtle)">
                    {t(`kinds.${concept.kind}`)}
                  </span>
                  {concept.cefrLevel ? (
                    <span className="text-xs text-(--color-ink-subtle)">{concept.cefrLevel}</span>
                  ) : null}
                  {concept.archivedAt ? (
                    <span className="text-xs text-(--color-ink-subtle)">{t("archivedBadge")}</span>
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
                  </div>
                ) : null}

                <div>
                  <form action={setConceptArchivedAction}>
                    <input type="hidden" name="locale" value={locale} />
                    <input type="hidden" name="conceptId" value={concept.id} />
                    <input type="hidden" name="archived" value={concept.archivedAt ? "0" : "1"} />
                    <Button type="submit" variant="secondary">
                      {concept.archivedAt ? t("actions.restore") : t("actions.archive")}
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
                  pathname: "/concepts",
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
                href={{ pathname: "/concepts", query: { ...baseQuery, page: String(page + 1) } }}
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
        <CreateConceptForm locale={locale} />
      </section>
    </main>
  );
}
