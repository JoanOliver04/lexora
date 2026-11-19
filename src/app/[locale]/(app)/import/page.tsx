import { notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { importDeckTargetSchema } from "@/modules/importing/application/import-transfer";
import { readDeckOptions } from "@/modules/library/application/library-options";
import { TutorialHint } from "@/shared/presentation/components/tutorial-guides";

import { ImportPreviewForm } from "./import-preview-form";
import { pendingImportForCurrentUser } from "@/composition/import-transfer";

/**
 * Wizard de importación (LEX-4.8) sobre preview, duplicados y lote
 * (LEX-4.4…4.7). El asistente permite crear el mazo antes de guardar las tarjetas.
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
  searchParams: Promise<{
    job?: string | string[];
    deck?: string | string[];
    mode?: string | string[];
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

  const t = await getTranslations("Import");
  const query = await searchParams;
  const requested = importDeckTargetSchema.safeParse({ deckId: query.deck, mode: query.mode });
  if ((query.deck !== undefined || query.mode !== undefined) && !requested.success) notFound();
  const pending = await pendingImportForCurrentUser(
    activeCourse.id,
    typeof query.job === "string" ? query.job : undefined,
  );
  const library = await getLibraryContextForCurrentUser();
  if (!library) redirect(`/${locale}/login`);
  const deckId = pending ? pending.deckId : requested.data?.deckId;
  const deckMode = pending ? pending.mapping.deckMode : requested.data?.mode;
  const deckOptions = await readDeckOptions(library.options, {
    ownerId: library.ownerId,
    courseId: activeCourse.id,
    search: "",
    offset: 0,
    ...(deckId ? { selectedId: deckId } : {}),
  });
  if (requested.success && !pending && !deckOptions.selected) notFound();
  const target =
    deckMode && deckOptions.selected
      ? { deckId: deckOptions.selected.id, title: deckOptions.selected.title, mode: deckMode }
      : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-8 px-[clamp(12px,4vw,24px)] py-12 [overflow-wrap:anywhere]">
      <header className="flex flex-col gap-2">
        <Link
          href={target ? `/decks/${target.deckId}` : "/app"}
          className="inline-flex min-h-11 min-w-11 w-fit items-center text-sm text-(--color-ink-muted) underline underline-offset-4"
        >
          {t(target ? "target.back" : "backToApp")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-(--color-ink-muted)">{t("intro")}</p>
        {target && (
          <p className="font-medium">{t(`target.${target.mode}Title`, { deck: target.title })}</p>
        )}
      </header>
      <TutorialHint topic="import" />

      <ImportPreviewForm
        locale={locale}
        deckOptions={deckOptions}
        courseId={activeCourse.id}
        pending={pending}
        target={target}
      />
    </main>
  );
}
