import { type NextRequest, NextResponse } from "next/server";

import { completeAuthCallback } from "@/composition/identity";
import { resolveSafeRedirect } from "@/modules/identity/application/safe-redirect";
import { routing } from "@/i18n/routing";
import { clientEnv } from "@/env/client";

/**
 * Retorno PKCE de Supabase Auth: enlaces de correo y acceso personal por Google.
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
  const google = url.searchParams.get("flow") === "google";

  const rawLocale = url.searchParams.get("locale") ?? routing.defaultLocale;
  const locale = routing.locales.includes(rawLocale as (typeof routing.locales)[number])
    ? rawLocale
    : routing.defaultLocale;

  const destination = resolveSafeRedirect(
    url.searchParams.get("next"),
    google ? `/${locale}/app` : `/${locale}`,
  );
  const origin = clientEnv.NEXT_PUBLIC_SITE_URL;
  const failure = () => {
    const login = new URL(`/${locale}/login`, origin);
    login.searchParams.set("error", google ? "google-unavailable" : "missing-recovery-session");
    if (google) login.searchParams.set("next", destination);
    return redirectWithoutCache(login);
  };

  if (url.searchParams.has("error") || !code || code.length > 2048) return failure();
  try {
    if (!(await completeAuthCallback(code))) return failure();
  } catch {
    return failure();
  }

  return redirectWithoutCache(new URL(destination, origin));
}

function redirectWithoutCache(destination: URL): NextResponse {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
