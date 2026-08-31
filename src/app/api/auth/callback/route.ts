import { type NextRequest, NextResponse } from "next/server";

import { completeAuthCallback } from "@/composition/identity";
import { resolveSafeRedirect } from "@/modules/identity/application/safe-redirect";
import { routing } from "@/i18n/routing";

/**
 * Punto de retorno de los enlaces de correo de Supabase Auth (confirmación de
 * alta y recuperación de contraseña).
 *
 * Vive bajo `/api` a propósito: el `proxy.ts` excluye ese prefijo de su
 * `matcher`, así que `next-intl` no reescribe la URL antes de que este handler
 * lea el `code`. El idioma viaja como parámetro `locale`.
 *
 * El canje del `code` por una sesión (flujo PKCE) lo hace la composición; aquí
 * solo se decide a dónde redirigir.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  const rawLocale = url.searchParams.get("locale") ?? routing.defaultLocale;
  const locale = routing.locales.includes(rawLocale as (typeof routing.locales)[number])
    ? rawLocale
    : routing.defaultLocale;

  const destination = resolveSafeRedirect(url.searchParams.get("next"), `/${locale}`);

  if (!code || !(await completeAuthCallback(code))) {
    return NextResponse.redirect(
      new URL(`/${locale}/login?error=missing-recovery-session`, url.origin),
    );
  }

  return NextResponse.redirect(new URL(destination, url.origin));
}
