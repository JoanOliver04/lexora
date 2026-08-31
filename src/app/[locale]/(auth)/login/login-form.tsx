"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Input, Label } from "@/shared/presentation/components";

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
  const invalid = state.error === "invalid-credentials";

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
        <Label htmlFor="email">{t("login.emailLabel")}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={invalid || undefined}
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
        />
      </div>

      <PendingButton idle={t("login.submit")} pending={t("login.submitting")} />
    </form>
  );
}
