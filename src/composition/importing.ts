import type { DelimitedFileParser } from "@/modules/importing/application/delimited-file-parser";
import { createPapaParseDelimitedFileParser } from "@/modules/importing/infrastructure/papaparse-delimited-file-parser";

/**
 * Raíz de composición del módulo `importing` (LEX-4.2).
 *
 * `src/composition/` es el único sitio que conoce a la vez el puerto y su
 * implementación concreta (ADR-001). Aquí no hay lógica: solo cableado.
 *
 * A diferencia de `library`, parsear un archivo no necesita la identidad del
 * usuario —es una operación sin estado sobre el contenido de un archivo—, así
 * que no hay un `*ParaElUsuarioActual`: solo una fábrica. El primer llamador
 * es LEX-4.4 (previsualización y mapeo de columnas).
 */
export function createDelimitedFileParser(): DelimitedFileParser {
  return createPapaParseDelimitedFileParser();
}
