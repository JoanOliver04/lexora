import { getTranslations, setRequestLocale } from "next-intl/server";

import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { Button } from "@/shared/presentation/components";

/**
 * Marcador de posición del área autenticada. Solo existe para que la puerta de
 * `(app)/layout.tsx` tenga algo que proteger y se pueda probar de extremo a
 * extremo. La home real —selector de curso incluido— es LEX-2.9.
 */
export default async function AppHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("App");
  const tAuth = await getTranslations("Auth");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-(--color-ink-muted)">{t("placeholder")}</p>
      <form action={logoutAction}>
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="secondary">
          {tAuth("logout")}
        </Button>
      </form>
    </main>
  );
}
