import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { resolveSafeRedirect } from "@/modules/identity/application/safe-redirect";

import { AuthShell } from "../_components/auth-shell";
import { SignupForm } from "./signup-form";
import { getGoogleAvailability, isRegistrationOpen } from "@/composition/identity";
import { FormError } from "@/shared/presentation/components";
import { GoogleSignIn } from "../_components/google-sign-in";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  const emailSignup = isRegistrationOpen();
  const google = await getGoogleAvailability();
  if (!emailSignup && !google.signUp)
    return (
      <AuthShell
        title={t("private.title")}
        footer={
          <Link
            href="/login"
            className="inline-flex min-h-11 min-w-11 items-center text-(--color-accent) underline underline-offset-4"
          >
            {t("login.submit")}
          </Link>
        }
      >
        <p className="leading-relaxed text-(--color-ink-muted)">{t("private.description")}</p>
      </AuthShell>
    );

  const { next, error } = await searchParams;
  const safeNext = next ? resolveSafeRedirect(next, `/${locale}`) : undefined;

  return (
    <AuthShell
      title={t("signup.title")}
      footer={
        <>
          {t("signup.loginPrompt")}{" "}
          <Link
            href={safeNext ? { pathname: "/login", query: { next: safeNext } } : "/login"}
            className="inline-flex min-h-11 min-w-11 items-center text-(--color-accent) underline underline-offset-4"
          >
            {t("signup.loginLink")}
          </Link>
        </>
      }
    >
      {emailSignup && error === "confirmation-invalid" && (
        <FormError id="signup-confirmation-error">
          <p>{t("signup.confirmationError")}</p>
        </FormError>
      )}
      {(google.signUp || (emailSignup && google.signIn)) && (
        <GoogleSignIn
          locale={locale}
          next={safeNext}
          registrationOpen
          signup
          showEmailOption={emailSignup}
        />
      )}
      {emailSignup && <SignupForm locale={locale} next={safeNext} />}
    </AuthShell>
  );
}
