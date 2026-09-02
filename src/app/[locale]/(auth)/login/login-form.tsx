"use client";

import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";

import { FormError, Input, Label } from "@/shared/presentation/components";
import { useFocusFirstInvalid } from "@/shared/presentation/hooks/use-focus-first-invalid";

import type { AuthErrorCode } from "@/modules/identity/application/auth-flows";

import { loginAction, type AuthFormState } from "../actions";
import { PendingButton } from "../_components/pending-button";

export function LoginForm({
  locale,
  next,
  initialError,
}: {
  locale: string;
  next?: string | undefined;
  initialError?: AuthErrorCode | undefined;
}) {
  const t = useTranslations("Auth");
  const [state, action] = useActionState<AuthFormState, FormData>(
    loginAction,
    initialError ? { error: initialError } : {},
  );
  const invalid = Boolean(state.error);
  const formRef = useRef<HTMLFormElement>(null);
  useFocusFirstInvalid(formRef, state);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="locale" value={locale} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.error ? (
        <FormError id="login-error">
          <p>{t(`errors.${state.error}`)}</p>
        </FormError>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("login.emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "login-error" : undefined}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("login.passwordLabel")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? "login-error" : undefined}
        />
      </div>

      <PendingButton idle={t("login.submit")} pending={t("login.submitting")} />
    </form>
  );
}
