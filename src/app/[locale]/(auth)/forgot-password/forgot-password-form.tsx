"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Input, Label } from "@/shared/presentation/components";

import { Link } from "@/i18n/navigation";

import { forgotPasswordAction, type AuthFormState } from "../actions";
import { PendingButton } from "../_components/pending-button";

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<AuthFormState, FormData>(forgotPasswordAction, {});

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-3" role="status">
        <h2 className="text-lg font-medium">{t("forgot.sentTitle")}</h2>
        <p className="text-sm text-(--color-ink-muted)">{t("forgot.sentBody")}</p>
        <Link href="/login" className="text-sm text-(--color-accent) underline underline-offset-4">
          {t("forgot.backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <p className="text-sm text-(--color-ink-muted)">{t("forgot.description")}</p>

      {state.error ? (
        <p role="alert" className="text-sm text-(--color-danger)">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("forgot.emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(state.error) || undefined}
        />
      </div>

      <PendingButton idle={t("forgot.submit")} pending={t("forgot.submitting")} />
    </form>
  );
}
