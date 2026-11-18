/**
 * Saneamiento de contenido importado (LEX-4.5, §16.2–16.3).
 *
 * Lógica pura. El contenido se guarda como texto plano: Lexora no lo renderiza
 * con `dangerouslySetInnerHTML` (React escapa por defecto). Estas funciones
 * son defensa en profundidad, no la única barrera — ver `docs/SECURITY.md`.
 *
 * Se aplican **siempre**, no solo cuando el archivo declara `#html:true`: un
 * export de Anki suele llevar esa directiva, y un archivo sin ella también
 * puede traer etiquetas.
 */

import { MAX_ROW_SAMPLE_LENGTH } from "./limits";

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

function stripComments(input: string): string {
  const pieces: string[] = [];
  let cursor = 0;
  for (;;) {
    const start = input.indexOf("<!--", cursor);
    if (start === -1) break;
    const end = input.indexOf("-->", start + 4);
    if (end === -1) break;
    pieces.push(input.slice(cursor, start), " ");
    cursor = end + 3;
  }
  return pieces.length === 0 ? input : pieces.join("") + input.slice(cursor);
}

function stripIgnoredElements(text: string): string {
  // A tag cannot end beyond the last bracket. Do not send the unfinished tail
  // to patterns that would retry the same missing closing bracket.
  const lastTagEnd = text.lastIndexOf(">") + 1;
  let tail = text.slice(lastTagEnd);
  const markup = text
    .slice(0, lastTagEnd)
    .replace(
      /<(script|style|iframe|object|embed|link|meta|svg|form|textarea)\b[^>]*>[\s\S]*?(<\/\1>|$)/gi,
      (_match, _tag: string, closing: string) => {
        if (closing === "") tail = "";
        return " ";
      },
    );
  return markup + tail;
}

/**
 * Quita etiquetas HTML y deja el texto. El contenido de `script`/`style`/
 * `iframe` y similares se descarta entero (no basta con borrar la etiqueta).
 * `3 < 5` y el vocabulario con `<` suelto se conservan: solo se reconocen
 * etiquetas que empiezan por una letra.
 */
export function stripImportedHtml(input: string): string {
  let text = stripIgnoredElements(stripComments(input));
  text = text.replace(/<br\s*\/?>/gi, " ");
  text = text.replace(/<\/(?:p|div|tr|li|h[1-6]|blockquote|pre)>/gi, " ");
  const lastTagEnd = text.lastIndexOf(">") + 1;
  text =
    text.slice(0, lastTagEnd).replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^>]*)?>/g, "") +
    text.slice(lastTagEnd);

  return decodeBasicEntities(text);
}

function decodeBasicEntities(input: string): string {
  return input
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

/**
 * Muestra acotada y segura de una fila para la vista previa o para
 * `import_job_errors.row_sample` (LEX-4.7). Quita controles, recorta a
 * `MAX_ROW_SAMPLE_LENGTH` (200, por debajo del CHECK de 500 de la columna).
 * Nunca incluye una consulta, un secreto ni la fila entera si es larga.
 */
export function sanitizeRowSample(raw: string): string {
  const withoutControls = raw.toWellFormed().replace(CONTROL_CHARS, "");
  if (withoutControls.length <= MAX_ROW_SAMPLE_LENGTH) {
    return withoutControls;
  }
  return truncateImportText(withoutControls, MAX_ROW_SAMPLE_LENGTH);
}

/** UTF-16 limits must not leave a lone surrogate that PostgreSQL JSON rejects. */
export function truncateImportText(value: string, limit: number): string {
  const result = value.toWellFormed().slice(0, limit);
  const last = result.charCodeAt(result.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? result.slice(0, -1) : result;
}
