"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Input, Label } from "@/shared/presentation/components";

import { Link } from "@/i18n/navigation";

import { resetPasswordAction, type AuthFormState } from "../actions";
import { PendingButton } from "../_components/pending-button";

export function ResetPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});

  if (state.status === "done") {
    return (
      <div className="flex flex-col gap-3" role="status">
        <h2 className="text-lg font-medium">{t("reset.doneTitle")}</h2>
        <p className="text-sm text-(--color-ink-muted)">{t("reset.doneBody")}</p>
        <Link href="/login" className="text-sm text-(--color-accent) underline underline-offset-4">
          {t("reset.toLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {state.error ? (
        <p role="alert" className="text-sm text-(--color-danger)">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("reset.passwordLabel")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={Boolean(state.error) || undefined}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-(--color-ink-subtle)">
          {t("reset.passwordHint")}
        </p>
      </div>

      <PendingButton idle={t("reset.submit")} pending={t("reset.submitting")} />
    </form>
  );
}
