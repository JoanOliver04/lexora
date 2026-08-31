import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { hasCompletedOnboardingForCurrentUser } from "@/composition/onboarding";

import { OnboardingForm } from "./onboarding-form";

/**
 * Onboarding (MASTER_SPEC §9.3). La sesión y el perfil ya los garantiza
 * `(app)/layout.tsx`. Aquí solo se decide una cosa antes de pintar: si el
 * usuario **ya** completó el onboarding, no tiene nada que hacer en esta
 * pantalla y se le manda a la aplicación. El camino inverso —usuario sin
 * onboarding que entra a `/app`— lo cubre `(app)/app/page.tsx`.
 *
 * Flujo corto de una sola pantalla: idioma de interfaz, confirmación de los
 * idiomas de apoyo y objetivo (fijos en la V1), nivel declarado, nivel de
 * inicio y límite de ítems nuevos. El manejo fino de estados y la auditoría de
 * accesibilidad son LEX-2.10.
 */
export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  if (await hasCompletedOnboardingForCurrentUser()) {
    redirect(`/${locale}/app`);
  }

  const t = await getTranslations("Onboarding");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{t("title")}</h1>
        <p className="text-sm text-(--color-ink-muted)">{t("intro")}</p>
      </div>
      <OnboardingForm locale={locale} />
    </main>
  );
}
