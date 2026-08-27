import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

/**
 * Detecta el idioma y redirige a la ruta con prefijo.
 *
 * En Next.js 16 este archivo se llama `proxy.ts`; en versiones anteriores era
 * `middleware.ts`.
 */
export default createMiddleware(routing);

export const config = {
  // Se excluyen las rutas de API, los recursos internos de Next.js y cualquier
  // ruta con extensión: un fichero estático no tiene idioma.
  matcher: "/((?!api|_next|_vercel|.*\..*).*)",
};
