import { routing } from "@/i18n/routing";

/**
 * Qué rutas pertenecen al área autenticada.
 *
 * Incluye todas las raíces del grupo (app), también biblioteca e importación.
 * El prefijo de idioma ya está puesto cuando el proxy llama a esto.
 *
 * Se comprueba el `pathname` tal cual y también decodificado: `/{locale}/%61pp`
 * no debe colarse por no parecerse a `/{locale}/app`.
 */
const PROTECTED_SEGMENTS = ["app", "onboarding", "decks", "concepts", "import"];

const PATTERN = new RegExp(
  `^/(${routing.locales.join("|")})/(${PROTECTED_SEGMENTS.join("|")})(/|$)`,
);

export function isProtectedPath(pathname: string): boolean {
  if (PATTERN.test(pathname)) {
    return true;
  }
  try {
    return PATTERN.test(decodeURIComponent(pathname));
  } catch {
    // `pathname` mal formado: no es una ruta protegida válida.
    return false;
  }
}
