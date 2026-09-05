/**
 * Vista previa de importación (LEX-4.4).
 *
 * `mapPreviewRows` es la llamada que la pantalla hace cuando se cambia el
 * mapeo de columnas: reasigna las filas ya tokenizadas (`rawRows` del parser,
 * LEX-4.2) sin volver a leer el archivo. La lógica vive en el dominio
 * (`applyColumnMapping`); esto solo mantiene el borde de capas (la
 * presentación llama a `application/`, no a `domain/` directamente).
 *
 * No persiste nada. La validación real y los límites duros son LEX-4.5.
 */

import {
  type ColumnMapping,
  type MappedRows,
  applyColumnMapping,
} from "@/modules/importing/domain/column-mapping";
import type { RawImportRow } from "@/modules/importing/domain/row";

export function mapPreviewRows(rawRows: RawImportRow[], mapping: ColumnMapping): MappedRows {
  return applyColumnMapping(rawRows, mapping);
}
