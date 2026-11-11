import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "./i18n/routing";
import { isProtectedPath } from "./modules/identity/application/protected-paths";
import { resolveSafeRedirect } from "./modules/identity/application/safe-redirect";
import { refreshSupabaseSession } from "./shared/infrastructure/supabase/session";
import {
  contentSecurityPolicy,
  createCspNonce,
} from "./shared/infrastructure/security/content-security-policy";
import { clientEnv } from "./env/client";
import { serverEnv } from "./env/server";

/**
 * Se ejecuta antes que cualquier ruta. Hace tres cosas, y el orden importa.
 *
 * En Next.js 16 este archivo se llama `proxy.ts`; antes era `middleware.ts`.
 *
 * **1. Idioma.** `next-intl` decide a qué locale corresponde la petición y puede
 * devolver una redirección. La entrada sin prefijo `/app` puede sustituir ese
 * idioma inicial por la preferencia de la cuenta verificada.
 *
 * **2. Sesión.** Se renueva el token sobre la respuesta del paso anterior y se
 * obtiene el `userId` ya verificado.
 *
 * **3. Puerta del área autenticada.** Si la ruta es privada y no hay sesión, se
 * redirige a `login` con `next` para volver después. Esto es la comodidad; la
 * barrera de verdad es el `layout` de `(app)`, que vuelve a comprobarlo en el
 * servidor. Las respuestas de rutas privadas se marcan `private, no-store` para
 * que no acaben en una caché compartida.
 */
export default async function proxy(request: NextRequest): Promise<NextResponse> {
  const nonce = createCspNonce();
  const policy = contentSecurityPolicy({
    nonce,
    backendUrl: clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    siteUrl: clientEnv.NEXT_PUBLIC_SITE_URL,
    development: serverEnv.NODE_ENV === "development",
  });
  // Overwrite caller-supplied values. next-intl forwards these request headers
  // so Next can nonce its own scripts as well as the explicit theme bootstrap.
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  const intlMiddleware = createMiddleware(routing);
  const intlResponse = intlMiddleware(request);

  const { response, userId, entryLocale } = await refreshSupabaseSession(request, intlResponse);
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");

  const pathname = request.nextUrl.pathname;
  if (pathname === "/app" && entryLocale) {
    const entry = new URL(`/${entryLocale}/app`, request.url);
    entry.search = request.nextUrl.search;
    return privateRedirect(response, entry);
  }
  if (!isProtectedPath(pathname)) {
    return response;
  }

  if (!userId) {
    const locale = localeFromPath(pathname);
    const next = resolveSafeRedirect(pathname + request.nextUrl.search, `/${locale}`);
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("next", next);

    return privateRedirect(response, loginUrl);
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function privateRedirect(response: NextResponse, url: URL): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  // Conservar las cookies de sesión renovadas: crear una respuesta nueva las
  // perdería y el usuario quedaría desconectado al volver del login.
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie);
  }
  redirectResponse.headers.set("Cache-Control", "private, no-store");
  const policy = response.headers.get("Content-Security-Policy");
  if (policy) redirectResponse.headers.set("Content-Security-Policy", policy);
  return redirectResponse;
}

function localeFromPath(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  return routing.locales.includes(first as (typeof routing.locales)[number])
    ? first
    : routing.defaultLocale;
}

export const config = {
  // Only actual static namespaces bypass HTML handling. A dot in an app URL
  // must not skip the nonce/session handling (including a dynamic 404).
  matcher:
    "/((?!api(?:/|$)|_next(?:/|$)|_vercel(?:/|$)|icons(?:/|$)|sw\\.js$|offline\\.(?:html|css|js)$|manifest\\.webmanifest$|favicon\\.ico$).*)",
};
