import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthShell } from "../_components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  return (
    <AuthShell title={t("forgot.title")}>
      <ForgotPasswordForm locale={locale} />
    </AuthShell>
  );
}
