import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";

import { routing } from "./i18n/routing";
import { refreshSupabaseSession } from "./shared/infrastructure/supabase/session";

/**
 * Se ejecuta antes que cualquier ruta. Hace dos cosas, y el orden importa.
 *
 * En Next.js 16 este archivo se llama `proxy.ts`; antes era `middleware.ts`.
 *
 * **1. Idioma.** `next-intl` decide a qué locale corresponde la petición y puede
 * devolver una redirección. Va primero porque, si redirige, no tiene sentido
 * renovar la sesión sobre una respuesta que se va a descartar.
 *
 * **2. Sesión.** Se renueva el token sobre la respuesta que salga del paso
 * anterior, sea una redirección o la continuación normal. Las cookies se
 * escriben sobre **esa** respuesta, no sobre una nueva: crear una respuesta
 * aparte descartaría la decisión de idioma.
 *
 * El error fácil aquí es tratar los dos pasos como independientes y devolver la
 * respuesta equivocada. El síntoma sería sutil: la sesión se renueva pero el
 * usuario acaba en el idioma que no eligió, o al revés.
 */
export default async function proxy(request: NextRequest) {
  const intlMiddleware = createMiddleware(routing);
  const response = intlMiddleware(request);

  return refreshSupabaseSession(request, response);
}

export const config = {
  // Se excluyen las rutas de API, los recursos internos de Next.js y cualquier
  // ruta con extensión: un fichero estático no tiene idioma ni sesión.
  matcher: "/((?!api|_next|_vercel|.*\..*).*)",
};
