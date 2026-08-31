import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { AuthErrorCode } from "@/modules/identity/application/auth-flows";
import { resolveSafeRedirect } from "@/modules/identity/application/safe-redirect";

import { AuthShell } from "../_components/auth-shell";
import { LoginForm } from "./login-form";

// El callback redirige aquí con `?error=` cuando un enlace de correo falla.
const SHOWN_ERRORS = new Set<AuthErrorCode>(["auth-unavailable", "missing-recovery-session"]);

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  const { next, error } = await searchParams;
  // Se sanea aquí también: lo que se guarda en el campo oculto ya está filtrado.
  const safeNext = next ? resolveSafeRedirect(next, `/${locale}`) : undefined;
  const initialError = SHOWN_ERRORS.has(error as AuthErrorCode)
    ? (error as AuthErrorCode)
    : undefined;

  return (
    <AuthShell
      title={t("login.title")}
      footer={
        <>
          {t("login.signupPrompt")}{" "}
          <Link href="/signup" className="text-(--color-accent) underline underline-offset-4">
            {t("login.signupLink")}
          </Link>
        </>
      }
    >
      <LoginForm locale={locale} next={safeNext} initialError={initialError} />
      <Link
        href="/forgot-password"
        className="text-sm text-(--color-ink-muted) underline underline-offset-4"
      >
        {t("login.forgotLink")}
      </Link>
    </AuthShell>
  );
}
