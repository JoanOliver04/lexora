import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { getActiveCourseForCurrentUser } from "@/composition/courses";
import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";

/**
 * Shell del área autenticada (LEX-2.9).
 *
 * Todavía **vacío a propósito**: el panel «Hoy» (repasos vencidos, ítems
 * nuevos, tiempo estimado, `Empezar sesión`) es `MASTER_SPEC.md` §9.4 y
 * necesita mazos y planificador (FASE 3+). Lo que sí hace ya: asociar la home
 * al **curso activo** del usuario (`profiles.active_course_id`, resuelto en
 * `courses` con caída al más antiguo).
 *
 * Dos comprobaciones antes de pintar, cada una en su página para no crear un
 * bucle con `/onboarding` (la centralización en el layout necesita el
 * `pathname`, que un layout de Server Component no tiene a mano; queda para
 * cuando `(app)` tenga más de dos rutas — deuda anotada en `STATUS.md`):
 *
 *   · sin onboarding → `/onboarding`;
 *   · con onboarding pero sin curso (no debería ocurrir) → `/onboarding`.
 */
export default async function AppHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (!(await hasCompletedOnboardingForCurrentUser())) {
    redirect(`/${locale}/onboarding`);
  }

  const activeCourse = await getActiveCourseForCurrentUser();
  if (!activeCourse) {
    redirect(`/${locale}/onboarding`);
  }

  const t = await getTranslations("App");
  const tAuth = await getTranslations("Auth");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <header className="flex flex-col gap-1">
        <p className="text-xs tracking-wide text-(--color-ink-subtle) uppercase">
          {t("courseLabel")}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{activeCourse.title}</h1>
      </header>
      <p className="text-(--color-ink-muted)">{t("placeholder")}</p>
      <Link href="/decks" className="text-(--color-accent) underline underline-offset-4">
        {t("decksLink")}
      </Link>
      <form action={logoutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary">
          {tAuth("logout")}
        </Button>
      </form>
    </main>
  );
}
