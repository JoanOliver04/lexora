import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { resolveSafeRedirect } from "@/modules/identity/application/safe-redirect";

import { AuthShell } from "../_components/auth-shell";
import { SignupForm } from "./signup-form";

export default async function SignupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Auth");

  const { next } = await searchParams;
  const safeNext = next ? resolveSafeRedirect(next, `/${locale}`) : undefined;

  return (
    <AuthShell
      title={t("signup.title")}
      footer={
        <>
          {t("signup.loginPrompt")}{" "}
          <Link href="/login" className="text-(--color-accent) underline underline-offset-4">
            {t("signup.loginLink")}
          </Link>
        </>
      }
    >
      <SignupForm locale={locale} next={safeNext} />
    </AuthShell>
  );
}
