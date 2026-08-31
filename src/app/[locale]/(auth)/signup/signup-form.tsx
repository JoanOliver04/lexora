"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Input, Label } from "@/shared/presentation/components";

import { signupAction, type AuthFormState } from "../actions";
import { PendingButton } from "../_components/pending-button";

export function SignupForm({ locale, next }: { locale: string; next?: string | undefined }) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<AuthFormState, FormData>(signupAction, {});

  if (state.status === "check-email") {
    return (
      <div className="flex flex-col gap-3" role="status">
        <h2 className="text-lg font-medium">{t("signup.checkEmailTitle")}</h2>
        <p className="text-sm text-(--color-ink-muted)">{t("signup.checkEmailBody")}</p>
      </div>
    );
  }

  const emailInvalid = state.error === "email-invalid" || state.error === "email-required";
  const passwordInvalid =
    state.error === "password-too-short" ||
    state.error === "password-too-long" ||
    state.error === "weak-password";

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <p role="alert" className="text-sm text-(--color-danger)">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("signup.emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={emailInvalid || undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("signup.passwordLabel")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-invalid={passwordInvalid || undefined}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-(--color-ink-subtle)">
          {t("signup.passwordHint")}
        </p>
      </div>

      <PendingButton idle={t("signup.submit")} pending={t("signup.submitting")} />
    </form>
  );
}
