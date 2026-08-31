import { getTranslations } from "next-intl/server";

import { logoutAction } from "@/app/[locale]/(auth)/actions";
import { getCurrentUserId } from "@/composition/identity";
import { Link } from "@/i18n/navigation";
import { Button } from "@/shared/presentation/components";

/**
 * Muestra «Entrar» o «Cerrar sesión» según haya sesión verificada.
 *
 * Lee `getClaims()` —firma comprobada—, no `getSession()`. Que aparezca aquí
 * hace que la portada se renderice por petición en lugar de estáticamente: es el
 * precio de mostrar estado de sesión, y de momento solo lo paga esta cabecera.
 * La navegación autenticada de verdad llega en LEX-2.6/2.9.
 */
export async function SessionControls({ locale }: { locale: string }) {
  const userId = await getCurrentUserId();
  const t = await getTranslations("Auth");

  if (!userId) {
    return (
      <Link href="/login" className="text-sm text-(--color-accent) underline underline-offset-4">
        {t("login.submit")}
      </Link>
    );
  }

  return (
    <form action={logoutAction}>
      <input type="hidden" name="locale" value={locale} />
      <Button type="submit" variant="secondary">
        {t("logout")}
      </Button>
    </form>
  );
}
