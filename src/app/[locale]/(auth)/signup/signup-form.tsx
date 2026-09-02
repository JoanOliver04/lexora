"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError, Input, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import { signupAction, type AuthFormState } from "../actions";
import { PendingButton } from "../_components/pending-button";

export function SignupForm({ locale, next }: { locale: string; next?: string | undefined }) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<AuthFormState, FormData>(signupAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

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
  // `auth-unavailable` no señala un campo concreto: el `role="alert"` lo explica,
  // pero no se marca ningún `aria-invalid`.

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <FormError id="signup-error">
          <p>{t(`errors.${state.error}`)}</p>
        </FormError>
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
          aria-describedby={emailInvalid ? "signup-error" : undefined}
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
          aria-describedby={passwordInvalid ? "signup-error password-hint" : "password-hint"}
        />
        <p id="password-hint" className="text-xs text-(--color-ink-subtle)">
          {t("signup.passwordHint")}
        </p>
      </div>

      <PendingButton idle={t("signup.submit")} pending={t("signup.submitting")} />
    </form>
  );
}
