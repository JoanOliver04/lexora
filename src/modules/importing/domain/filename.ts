/**
 * Saneamiento del nombre de un archivo de importación (LEX-4.5, §16.2).
 *
 * Lógica pura. Lo que acabe en `import_jobs.original_filename` (LEX-4.7) pasa
 * por aquí: se quita cualquier ruta, los caracteres de control y las
 * secuencias `..`, y se recorta a 255 — el mismo tope que el CHECK de la
 * columna. No se usa como ruta de disco: el archivo no se guarda (§13.14);
 * aun así un nombre crudo del cliente no debe llegar a la base ni a la UI.
 */

import { MAX_FILENAME_LENGTH } from "./limits";

/** Nombre de reserva si, tras sanear, no queda nada usable. */
export const FALLBACK_FILENAME = "import.txt";

/**
 * Devuelve un nombre de archivo seguro: solo el último segmento, sin controles
 * ni `..`, recortado a `MAX_FILENAME_LENGTH`. Cualquier entrada que no sea un
 * string, o que quede vacía, se sustituye por `FALLBACK_FILENAME`.
 */
export function sanitizeFilename(raw: unknown): string {
  if (typeof raw !== "string") {
    return FALLBACK_FILENAME;
  }

  const base = raw.replaceAll("\\", "/").split("/").pop() ?? "";
  let cleaned = [...base]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code >= 32 && code !== 127;
    })
    .join("")
    .trim();

  while (cleaned.includes("..")) {
    cleaned = cleaned.replaceAll("..", ".");
  }
  cleaned = cleaned.trim();

  if (cleaned === "" || /^\.+$/.test(cleaned)) {
    return FALLBACK_FILENAME;
  }

  return cleaned.slice(0, MAX_FILENAME_LENGTH);
}
