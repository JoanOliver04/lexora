"use server";

import { redirect } from "next/navigation";

import type { AuthErrorCode } from "@/modules/identity/application/auth-flows";
import { resolveSafeRedirect } from "@/modules/identity/application/safe-redirect";
import {
  registerVisitor,
  requestPasswordResetFor,
  signInVisitor,
  signOutVisitor,
  updateCurrentPassword,
} from "@/composition/identity";
import { clientEnv } from "@/env/client";
import { routing } from "@/i18n/routing";

/**
 * Server Actions de autenticación. Delgadas (ADR-001): leen el formulario,
 * llaman a la composición y devuelven una **clave de error estable** que el
 * componente traduce. No hablan ningún idioma.
 *
 * El `locale` llega en un campo oculto del formulario y se valida contra la
 * lista de idiomas: entra en un `redirect()`, así que se trata igual que
 * `next`.
 */

export interface AuthFormState {
  error?: AuthErrorCode;
  status?: "check-email" | "sent" | "done";
}

function safeLocale(formData: FormData): string {
  const raw = String(formData.get("locale") ?? "");
  return routing.locales.includes(raw as (typeof routing.locales)[number])
    ? raw
    : routing.defaultLocale;
}

function absoluteUrl(path: string): string {
  return new URL(path, clientEnv.NEXT_PUBLIC_SITE_URL).toString();
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = safeLocale(formData);
  const outcome = await signInVisitor({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!outcome.ok) {
    return { error: outcome.error };
  }

  redirect(resolveSafeRedirect(String(formData.get("next") ?? ""), `/${locale}`));
}

export async function signupAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = safeLocale(formData);
  const outcome = await registerVisitor(
    { email: formData.get("email"), password: formData.get("password") },
    absoluteUrl(`/api/auth/callback?locale=${locale}`),
  );

  if (!outcome.ok) {
    return { error: outcome.error };
  }
  if (outcome.result === "signed-in") {
    redirect(resolveSafeRedirect(String(formData.get("next") ?? ""), `/${locale}`));
  }
  return { status: "check-email" };
}

export async function forgotPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const locale = safeLocale(formData);
  const outcome = await requestPasswordResetFor(
    { email: formData.get("email") },
    absoluteUrl(`/api/auth/callback?locale=${locale}&next=/${locale}/reset-password`),
  );

  // Un correo mal formado sí se avisa; un correo desconocido termina igual que
  // uno conocido: "sent".
  if (!outcome.ok && outcome.error !== "auth-unavailable") {
    return { error: outcome.error };
  }
  return { status: "sent" };
}

export async function resetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const outcome = await updateCurrentPassword({ password: formData.get("password") });

  if (!outcome.ok) {
    return { error: outcome.error };
  }
  return { status: "done" };
}

export async function logoutAction(formData: FormData): Promise<void> {
  const locale = safeLocale(formData);
  await signOutVisitor();
  redirect(`/${locale}/login`);
}
