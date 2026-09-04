import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { listConcepts } from "@/modules/library/application/concept";
import { listConceptTags } from "@/modules/library/application/tag";
import { Button } from "@/shared/presentation/components";

import { setConceptArchivedAction } from "./actions";
import { CreateConceptForm } from "./create-concept-form";

/**
 * Lista de conceptos del curso activo (LEX-3.6), segunda pantalla de la
 * biblioteca. Mismo patrón que `decks/page.tsx` (LEX-3.5): la puerta de
 * onboarding se repite por página (deuda anotada desde LEX-2.9/3.5).
 */
export default async function ConceptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ archived?: string }>;
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

  const includeArchived = (await searchParams).archived === "1";
  const concepts = await listConcepts(context.concepts, context.ownerId, activeCourse.id, {
    includeArchived,
  });
  // Un `listConceptTags` por concepto: N+1 consciente, como los recuentos de
  // `decks/page.tsx`. LEX-3.9 resuelve las consultas paginadas.
  const tagsByConcept = await Promise.all(
    concepts.map((concept) => listConceptTags(context.tags, context.ownerId, concept.id)),
  );

  const t = await getTranslations("Concepts");

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
              href="/concepts"
              className="text-sm text-(--color-ink-muted) underline underline-offset-4"
            >
              {t("hideArchived")}
            </Link>
          ) : (
            <Link
              href={{ pathname: "/concepts", query: { archived: "1" } }}
              className="text-sm text-(--color-ink-muted) underline underline-offset-4"
            >
              {t("showArchived")}
            </Link>
          )}
        </div>

        {concepts.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">{t("emptyConcepts")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {concepts.map((concept, index) => (
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

                {(tagsByConcept[index] ?? []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(tagsByConcept[index] ?? []).map((tag) => (
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
      </section>

      <section className="flex flex-col gap-4 border-t border-(--color-border) pt-8">
        <h2 className="text-lg font-medium">{t("createHeading")}</h2>
        <CreateConceptForm locale={locale} />
      </section>
    </main>
  );
}
