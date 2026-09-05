/**
 * Puerto del parser de archivos delimitados (LEX-4.2).
 *
 * MASTER_SPEC §9.7: «el parser debe estar aislado tras una interfaz para
 * poder sustituirse». Mismo principio que `SpacedRepetitionScheduler` para
 * `ts-fsrs` (ADR-003): ninguna capa superior a `application/` importa Papa
 * Parse ni ninguna otra librería de CSV directamente. La regla la exige el
 * lint por glob (`no-restricted-imports`), sin configuración específica de
 * este módulo.
 *
 * Este puerto **solo parsea**: no valida longitudes ni sanea HTML (LEX-4.5),
 * no persiste nada (`import_jobs` es LEX-4.3), no decide qué se hace con una
 * detección de baja confianza (LEX-4.4). Devuelve las filas reconocidas y los
 * problemas por separado; nunca lanza porque una fila individual sea inválida.
 */

import type { Separator } from "@/modules/importing/domain/separator";
import type { ImportRowIssue, ParsedImportRow } from "@/modules/importing/domain/row";

export interface ParseFileResult {
  /** El separador que se usó: el de la directiva `#separator:` o el de la heurística. */
  separator: Separator;
  /** Si `separator` vino de una directiva explícita (`true`) o de la heurística (`false`). */
  separatorFromDirective: boolean;
  rows: ParsedImportRow[];
  issues: ImportRowIssue[];
}

export interface DelimitedFileParser {
  /**
   * `content` es el texto completo del archivo ya decodificado como UTF-8. Un
   * BOM inicial se tolera y se descarta (no forma parte del primer campo).
   */
  parse(content: string): ParseFileResult;
}
