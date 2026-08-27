import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "./routing";

/**
 * Configuración por petición: resuelve el idioma y carga sus mensajes.
 *
 * `hasLocale` no es decorativo: el segmento `[locale]` viene de la URL, que la
 * escribe quien quiera. Sin comprobarlo, `../../messages/${locale}.json` sería
 * una importación con una ruta controlada por el usuario. Un idioma
 * desconocido cae al idioma por defecto en lugar de intentar cargar nada.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
