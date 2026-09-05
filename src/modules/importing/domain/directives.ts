/**
 * Líneas directivas de un archivo de importación (LEX-4.2, `docs/IMPORT_FORMAT.md`).
 *
 * Lógica pura. Las directivas empiezan por `#` y **solo** son válidas al
 * principio del archivo, antes de la primera fila de datos: `splitLeadingDirectiveLines`
 * corta en la primera línea que no empieza por `#`, así que una línea `#…`
 * posterior queda dentro de `rest` y el parser la trata como fila literal
 * (fixture `comment-line-not-a-directive.txt`).
 */

import { type Separator, parseSeparatorDirective } from "./separator";

/** Columna de etiquetas por defecto (1-indexada): la tercera (§9.7). */
export const DEFAULT_TAGS_COLUMN = 3;

export interface ImportDirectives {
  /** Separador explícito de `#separator:`. `null` si no se declaró (→ heurística). */
  separator: Separator | null;
  /** Columna (1-indexada) que lleva las etiquetas. `#tags column:` la mueve. */
  tagsColumn: number;
  /** `#html:true|false`. `null` si no se declaró. Lexora no renderiza HTML importado sin sanitizar (SECURITY.md §16.2) independientemente de esto. */
  html: boolean | null;
}

export interface SplitContent {
  directiveLines: string[];
  /** El resto del archivo, desde la primera línea que no es directiva. */
  rest: string;
  /** Número de línea (1-indexado) de la primera fila de datos en el archivo original. */
  dataStartLine: number;
}

/**
 * Separa las líneas directivas contiguas del principio del resto del archivo.
 * Solo mira el prefijo: en cuanto una línea no empieza por `#`, deja de
 * consumir —aunque más adelante vuelva a haber líneas `#`—. Seguro porque una
 * directiva de Anki es siempre una línea simple (nunca un campo entrecomillado
 * multilínea), así que este corte por líneas no parte una fila de datos.
 */
export function splitLeadingDirectiveLines(content: string): SplitContent {
  const lines = content.split(/\r\n|\n/);
  let index = 0;
  while (index < lines.length && lines[index]!.startsWith("#")) {
    index += 1;
  }
  return {
    directiveLines: lines.slice(0, index),
    rest: lines.slice(index).join("\n"),
    dataStartLine: index + 1,
  };
}

/**
 * Interpreta las líneas directivas. Claves reconocidas: `separator`,
 * `tags column`, `html`. `notetype column`, `deck column` y `columns` se
 * reconocen para no tratarlas como fila de datos, pero no tienen efecto en
 * Lexora (`docs/IMPORT_FORMAT.md`). Un valor de `tags column` no numérico o
 * fuera de rango cae en el valor por defecto.
 */
export function parseDirectiveLines(lines: string[]): ImportDirectives {
  let separator: Separator | null = null;
  let tagsColumn = DEFAULT_TAGS_COLUMN;
  let html: boolean | null = null;

  for (const line of lines) {
    const withoutHash = line.startsWith("#") ? line.slice(1) : line;
    const colonAt = withoutHash.indexOf(":");
    if (colonAt === -1) {
      continue;
    }
    const key = withoutHash.slice(0, colonAt).trim().toLowerCase();
    const value = withoutHash.slice(colonAt + 1).trim();

    if (key === "separator") {
      separator = parseSeparatorDirective(value) ?? separator;
    } else if (key === "tags column") {
      const parsed = Number.parseInt(value, 10);
      tagsColumn = Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_TAGS_COLUMN;
    } else if (key === "html") {
      html = value.toLowerCase() === "true";
    }
  }

  return { separator, tagsColumn, html };
}
