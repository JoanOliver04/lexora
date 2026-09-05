/**
 * Separador de un archivo de importación (LEX-4.2).
 *
 * Lógica pura: sin librería de CSV, sin entrada ni salida. El adaptador
 * (`infrastructure/`) es quien pasa el carácter resultante a Papa Parse; aquí
 * solo se decide **cuál** es, a partir de la directiva `#separator:` si existe
 * o de una heurística sobre la primera línea de datos (`docs/IMPORT_FORMAT.md`).
 */

export type Separator = "tab" | "comma" | "semicolon";

const SEPARATOR_CHAR: Record<Separator, string> = {
  tab: "\t",
  comma: ",",
  semicolon: ";",
};

/** El carácter real que separa columnas para un `Separator` dado. */
export function separatorChar(separator: Separator): string {
  return SEPARATOR_CHAR[separator];
}

/**
 * Interpreta el valor de una directiva `#separator:<valor>`. Solo se
 * reconocen los tres nombres documentados; cualquier otro valor devuelve
 * `null` para que quien llama caiga en la heurística (`detectSeparator`).
 */
export function parseSeparatorDirective(value: string): Separator | null {
  switch (value.trim().toLowerCase()) {
    case "tab":
      return "tab";
    case "comma":
      return "comma";
    case "semicolon":
      return "semicolon";
    default:
      return null;
  }
}

function countChar(text: string, char: string): number {
  let count = 0;
  for (const c of text) {
    if (c === char) count += 1;
  }
  return count;
}

/**
 * Heurística cuando no hay directiva `#separator:` (`docs/IMPORT_FORMAT.md`):
 * si la primera línea de datos tiene una tabulación, es TSV; si no, se elige
 * entre coma y punto y coma por cuál aparece más. Empate o ninguno → coma.
 * No adivina agresivamente: la confirmación real en pantalla es de LEX-4.4.
 */
export function detectSeparator(firstDataLine: string): Separator {
  if (firstDataLine.includes("\t")) {
    return "tab";
  }
  return countChar(firstDataLine, ";") > countChar(firstDataLine, ",") ? "semicolon" : "comma";
}
