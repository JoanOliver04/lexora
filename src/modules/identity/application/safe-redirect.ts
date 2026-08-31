/**
 * Lista blanca de destinos de redirección tras autenticarse.
 *
 * MASTER_SPEC §16.1: «Redirecciones de autenticación permitidas mediante lista
 * segura.» El parámetro `next` de un formulario de login lo escribe quien
 * quiera, así que un `next=https://sitio-falso/login` copiado en un correo
 * llevaría al usuario ya autenticado a una página que no controlamos.
 *
 * Regla: solo se acepta una **ruta absoluta dentro de este sitio**: empieza por
 * una sola `/`, sin esquema, sin host, sin barra invertida. Cualquier otra cosa
 * cae al `fallback`.
 */

const DEFAULT_FALLBACK = "/";

/** Códigos por debajo de `0x21` incluyen el espacio y todos los de control. */
const FIRST_PRINTABLE_CODE = 0x21;

function hasControlOrSpace(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) < FIRST_PRINTABLE_CODE) {
      return true;
    }
  }
  return false;
}

export function resolveSafeRedirect(
  raw: string | null | undefined,
  fallback: string = DEFAULT_FALLBACK,
): string {
  if (typeof raw !== "string") {
    return fallback;
  }

  const candidate = raw.trim();

  // Debe empezar por una sola `/`. `//host` y `/\host` los interpreta el
  // navegador como «protocolo relativo», es decir, otro sitio.
  if (!candidate.startsWith("/")) {
    return fallback;
  }
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }

  // Sin barra invertida en ningún punto: algunos navegadores la normalizan a
  // `/`, y `/\evil.com` acabaría saliendo del sitio.
  if (candidate.includes("\\")) {
    return fallback;
  }

  // Sin `:` en ningún punto: descarta `javascript:` y cualquier esquema. Las
  // rutas de esta aplicación no llevan dos puntos (los identificadores son
  // UUID), así que la restricción no molesta y cierra el caso de golpe.
  if (candidate.includes(":")) {
    return fallback;
  }

  // Sin espacios ni caracteres de control incrustados.
  if (hasControlOrSpace(candidate)) {
    return fallback;
  }

  return candidate;
}
