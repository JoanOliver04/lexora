import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { listDecks } from "@/modules/library/application/deck";

import { ImportPreviewForm } from "./import-preview-form";
import { pendingImportForCurrentUser } from "@/composition/import-transfer";

/**
 * Wizard de importación (LEX-4.8) sobre preview, duplicados y lote
 * (LEX-4.4…4.7). El mazo de destino tiene que existir ya en el curso.
 *
 * Puerta de onboarding repetida por página, como el resto de `(app)` (deuda
 * anotada desde LEX-2.9). Un import sin curso al que importar no tiene
 * sentido, así que se redirige igual que las pantallas de biblioteca.
 */
export default async function ImportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ job?: string | string[] }>;
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

  const t = await getTranslations("Import");
  const query = await searchParams;
  const pending = await pendingImportForCurrentUser(
    activeCourse.id,
    typeof query.job === "string" ? query.job : undefined,
  );
  const library = await getLibraryContextForCurrentUser();
  const decks = library
    ? (await listDecks(library.decks, library.ownerId, activeCourse.id)).map((deck) => ({
        id: deck.id,
        title: deck.title,
      }))
    : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-6 py-12 [overflow-wrap:anywhere]">
      <header className="flex flex-col gap-2">
        <Link href="/app" className="text-sm text-(--color-ink-muted) underline underline-offset-4">
          {t("backToApp")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-(--color-ink-muted)">{t("intro")}</p>
      </header>

      <ImportPreviewForm
        locale={locale}
        decks={decks}
        courseId={activeCourse.id}
        pending={pending}
      />
    </main>
  );
}
