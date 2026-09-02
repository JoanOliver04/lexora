"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError, FormStatus, Input, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { Link } from "@/i18n/navigation";

import { resetPasswordAction, type AuthFormState } from "../actions";
import { PendingButton } from "../_components/pending-button";

export function ResetPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  if (state.status === "done") {
    return (
      <FormStatus>
        <h2 className="text-lg font-medium">{t("reset.doneTitle")}</h2>
        <p className="text-sm text-(--color-ink-muted)">{t("reset.doneBody")}</p>
        <Link href="/login" className="text-sm text-(--color-accent) underline underline-offset-4">
          {t("reset.toLogin")}
        </Link>
      </FormStatus>
    );
  }

  const invalid = Boolean(state.error);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />

      {state.error ? (
        <FormError id="reset-error">
          <p>{t(`errors.${state.error}`)}</p>
        </FormError>
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
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "reset-error password-hint" : "password-hint"}
        />
        <p id="password-hint" className="text-xs text-(--color-ink-subtle)">
          {t("reset.passwordHint")}
        </p>
      </div>

      <PendingButton idle={t("reset.submit")} pending={t("reset.submitting")} />
    </form>
  );
}
