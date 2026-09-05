import Papa from "papaparse";

import type {
  DelimitedFileParser,
  ParseFileResult,
} from "@/modules/importing/application/delimited-file-parser";
import {
  parseDirectiveLines,
  splitLeadingDirectiveLines,
} from "@/modules/importing/domain/directives";
import {
  type ImportRowIssue,
  type ParsedImportRow,
  classifyRow,
  isImportRowIssue,
} from "@/modules/importing/domain/row";
import { detectSeparator, separatorChar } from "@/modules/importing/domain/separator";

/**
 * Implementación de `DelimitedFileParser` sobre Papa Parse (LEX-4.2).
 *
 * Papa Parse hace **solo** la tokenización: separa el texto en filas de
 * columnas respetando comillas RFC 4180 y separadores dentro de un campo
 * entrecomillado. Todo lo demás —descartar el BOM, separar las líneas
 * directivas, elegir el separador, clasificar cada fila y numerarla como se
 * ve en el archivo— es lógica pura del `domain/`.
 *
 * `papaparse` no se importa en ninguna otra parte del código: este archivo es
 * la única frontera con la librería (regla de capas, `no-restricted-imports`).
 */

const BOM = "﻿";

export function createPapaParseDelimitedFileParser(): DelimitedFileParser {
  return {
    parse(rawContent: string): ParseFileResult {
      const content = rawContent.startsWith(BOM) ? rawContent.slice(BOM.length) : rawContent;

      const { directiveLines, rest, dataStartLine } = splitLeadingDirectiveLines(content);
      const directives = parseDirectiveLines(directiveLines);

      const firstDataLine = rest.split(/\r\n|\n/, 1)[0] ?? "";
      const separator = directives.separator ?? detectSeparator(firstDataLine);

      // `skipEmptyLines: false` a propósito: así el índice de cada fila que
      // devuelve Papa Parse se alinea 1:1 con la línea del archivo, y el
      // número de fila reportado (`dataStartLine + index`) es el que se ve.
      // Una línea en blanco se tokeniza como `[""]` y `classifyRow` la marca
      // `too_few_columns` en vez de tragársela en silencio.
      const parsed = Papa.parse<string[]>(rest, {
        delimiter: separatorChar(separator),
        skipEmptyLines: false,
        newline: "\n",
      });

      const rows: ParsedImportRow[] = [];
      const issues: ImportRowIssue[] = [];

      parsed.data.forEach((columns, index) => {
        // Papa Parse añade una fila vacía final si el archivo termina en salto
        // de línea; se ignora (no es una fila real del archivo).
        const isTrailingEmptyRow =
          index === parsed.data.length - 1 && columns.length === 1 && columns[0] === "";
        if (isTrailingEmptyRow) {
          return;
        }
        const classified = classifyRow(columns, dataStartLine + index, directives.tagsColumn);
        if (isImportRowIssue(classified)) {
          issues.push(classified);
        } else {
          rows.push(classified);
        }
      });

      return {
        separator,
        separatorFromDirective: directives.separator !== null,
        rows,
        issues,
      };
    },
  };
}
