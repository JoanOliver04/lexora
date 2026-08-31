import createMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";

import { routing } from "./i18n/routing";
import { isProtectedPath } from "./modules/identity/application/protected-paths";
import { resolveSafeRedirect } from "./modules/identity/application/safe-redirect";
import { refreshSupabaseSession } from "./shared/infrastructure/supabase/session";

/**
 * Se ejecuta antes que cualquier ruta. Hace tres cosas, y el orden importa.
 *
 * En Next.js 16 este archivo se llama `proxy.ts`; antes era `middleware.ts`.
 *
 * **1. Idioma.** `next-intl` decide a qué locale corresponde la petición y puede
 * devolver una redirección. Va primero porque, si redirige, no tiene sentido
 * renovar la sesión sobre una respuesta que se va a descartar.
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
  const intlMiddleware = createMiddleware(routing);
  const intlResponse = intlMiddleware(request);

  const { response, userId } = await refreshSupabaseSession(request, intlResponse);

  const pathname = request.nextUrl.pathname;
  if (!isProtectedPath(pathname)) {
    return response;
  }

  if (!userId) {
    const locale = localeFromPath(pathname);
    const next = resolveSafeRedirect(pathname + request.nextUrl.search, `/${locale}`);
    const loginUrl = new URL(`/${locale}/login`, request.url);
    loginUrl.searchParams.set("next", next);

    const redirectResponse = NextResponse.redirect(loginUrl);
    // Conservar las cookies de sesión renovadas: crear una respuesta nueva las
    // perdería y el usuario quedaría desconectado al volver del login.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

function localeFromPath(pathname: string): string {
  const first = pathname.split("/")[1] ?? "";
  return routing.locales.includes(first as (typeof routing.locales)[number])
    ? first
    : routing.defaultLocale;
}

export const config = {
  // Se excluyen las rutas de API, los recursos internos de Next.js y cualquier
  // ruta con un punto (un fichero con extensión: no tiene idioma ni sesión).
  //
  // El `\\.` es deliberado: en la cadena JavaScript se convierte en `\.`, que en
  // la expresión regular es un punto literal. Escrito como `\.` el analizador de
  // cadenas se come la barra y queda `.` —«cualquier carácter»—, con lo que el
  // negative lookahead descartaba **toda** ruta con contenido y el proxy solo se
  // ejecutaba en `/`. La renovación de sesión y esta puerta necesitan que corra
  // en `/{locale}/...`.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
