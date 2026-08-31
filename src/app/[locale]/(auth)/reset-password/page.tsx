import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthShell } from "../_components/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

/**
 * A esta pantalla se llega desde el enlace del correo de recuperación, que pasa
 * antes por `/api/auth/callback`: allí se canjea el código y se deja una sesión
 * de recuperación en la cookie. Aquí solo se elige la contraseña nueva.
 */
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  return (
    <AuthShell title={t("reset.title")}>
      <ResetPasswordForm locale={locale} />
    </AuthShell>
  );
}
