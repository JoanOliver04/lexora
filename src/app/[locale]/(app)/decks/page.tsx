import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { listDeckConcepts, listDecks } from "@/modules/library/application/deck";
import { Button } from "@/shared/presentation/components";

import { setDeckArchivedAction, moveDeckAction } from "./actions";
import { CreateDeckForm } from "./create-deck-form";

/**
 * Lista de mazos del curso activo (LEX-3.5), primera pantalla visible de la
 * biblioteca.
 *
 * La puerta de onboarding sigue por página (deuda anotada en `STATUS.md` desde
 * LEX-2.9; con esta tarea `(app)` pasa de dos a cuatro rutas y la condición que
 * el comentario de `app/page.tsx` nombraba —«cuando `(app)` tenga más de dos
 * rutas»— se cumple). Se repiten aquí las dos redirecciones para que un usuario
 * sin curso no llegue a una pantalla cuyo `courseId` sería nulo.
 *
 * `?archived=1` muestra también los mazos archivados: sin ese parámetro
 * `restoreDeck` sería código muerto.
 */
export default async function DecksPage({
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
  const decks = await listDecks(context.decks, context.ownerId, activeCourse.id, {
    includeArchived,
  });
  // Un `listDeckConcepts` por mazo: N+1 consciente. Con los pocos mazos de un
  // curso en la V1 es asumible; las consultas paginadas sin N+1 son LEX-3.9.
  const counts = await Promise.all(
    decks.map((deck) =>
      listDeckConcepts(context.decks, context.ownerId, deck.id).then((items) => items.length),
    ),
  );

  const t = await getTranslations("Library");

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
              href="/decks"
              className="text-sm text-(--color-ink-muted) underline underline-offset-4"
            >
              {t("hideArchived")}
            </Link>
          ) : (
            <Link
              href={{ pathname: "/decks", query: { archived: "1" } }}
              className="text-sm text-(--color-ink-muted) underline underline-offset-4"
            >
              {t("showArchived")}
            </Link>
          )}
        </div>

        {decks.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">{t("emptyDecks")}</p>
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
                  {t("conceptCount", { count: counts[index] ?? 0 })}
                </p>

                <div className="flex flex-wrap gap-2">
                  {!includeArchived && !deck.archivedAt ? (
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
      </section>

      <section className="flex flex-col gap-4 border-t border-(--color-border) pt-8">
        <h2 className="text-lg font-medium">{t("createHeading")}</h2>
        <CreateDeckForm locale={locale} />
      </section>
    </main>
  );
}
