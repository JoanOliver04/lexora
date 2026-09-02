"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError, Input, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { Link } from "@/i18n/navigation";

import { forgotPasswordAction, type AuthFormState } from "../actions";
import { PendingButton } from "../_components/pending-button";

export function ForgotPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<AuthFormState, FormData>(forgotPasswordAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

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

  const invalid = Boolean(state.error);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />

      <p className="text-sm text-(--color-ink-muted)">{t("forgot.description")}</p>

      {state.error ? (
        <FormError id="forgot-error">
          <p>{t(`errors.${state.error}`)}</p>
        </FormError>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("forgot.emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "forgot-error" : undefined}
        />
      </div>

      <PendingButton idle={t("forgot.submit")} pending={t("forgot.submitting")} />
    </form>
  );
}
