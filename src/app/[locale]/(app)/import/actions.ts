"use server";

import { createDelimitedFileParser } from "@/composition/importing";
import {
  MAX_FILE_BYTES,
  inspectImportUpload,
  issuesWithSamples,
  mapPreviewRows,
} from "@/modules/importing/application/preview";
import { sanitizeFilename } from "@/modules/importing/domain/filename";
import {
  DEFAULT_COLUMN_MAPPING,
  type ColumnMapping,
} from "@/modules/importing/domain/column-mapping";
import type {
  ImportRowIssueCode,
  ParsedImportRow,
  RawImportRow,
} from "@/modules/importing/domain/row";
import type { Separator } from "@/modules/importing/domain/separator";

/**
 * Vista previa de una importación (LEX-4.4, barreras LEX-4.5). **No persiste
 * nada** (§9.7 pasos 1–4): rechaza un archivo demasiado grande o con demasiadas
 * filas **antes** de parsear, sanea el nombre, parsea con el puerto de LEX-4.2
 * y devuelve el separador detectado, una muestra acotada de filas y el mapeo
 * de columnas actual. Cambiar el mapeo re-pinta la muestra sin volver a subir
 * el archivo: la muestra acotada viaja en un campo oculto (`carried`).
 */

const PREVIEW_LIMIT = 50;

interface CarriedPreview {
  filename: string;
  separator: Separator;
  separatorFromDirective: boolean;
  columnCount: number;
  totalRows: number;
  totalIssues: number;
  previewRaw: RawImportRow[];
}

export interface ImportPreviewState {
  error?: "no-file" | "empty-file" | "read-failed" | "too-large" | "too-many-rows";
  filename?: string;
  separator?: Separator;
  separatorFromDirective?: boolean;
  columnCount?: number;
  /** Recuentos sobre el archivo **completo**, con el mapeo por defecto del parser. */
  totalRows?: number;
  totalIssues?: number;
  mapping?: ColumnMapping;
  /** Lo que se vuelve a serializar en el campo oculto para el siguiente envío. */
  carried?: CarriedPreview;
  /** La muestra ya mapeada con `mapping`, para la tabla de vista previa. */
  previewRows?: ParsedImportRow[];
  previewIssues?: { rowNumber: number; code: ImportRowIssueCode; sample: string }[];
}

function readMapping(formData: FormData, columnCount: number): ColumnMapping {
  const clampIndex = (name: string, fallback: number): number => {
    const raw = Number.parseInt(String(formData.get(name) ?? ""), 10);
    return Number.isInteger(raw) && raw >= 0 && raw < columnCount ? raw : fallback;
  };

  const rawTags = String(formData.get("tagsColumn") ?? "");
  let tags: number | null;
  if (rawTags === "none") {
    tags = null;
  } else {
    const parsed = Number.parseInt(rawTags, 10);
    tags =
      Number.isInteger(parsed) && parsed >= 0 && parsed < columnCount
        ? parsed
        : DEFAULT_COLUMN_MAPPING.tags;
  }

  return {
    front: clampIndex("frontColumn", DEFAULT_COLUMN_MAPPING.front),
    back: clampIndex("backColumn", DEFAULT_COLUMN_MAPPING.back),
    tags,
  };
}

export async function previewImportAction(
  _prev: ImportPreviewState,
  formData: FormData,
): Promise<ImportPreviewState> {
  const file = formData.get("file");
  const carriedRaw = formData.get("carried");

  let carried: CarriedPreview;

  if (file instanceof File && file.size > 0) {
    const filename = sanitizeFilename(file.name);
    // Rechazar por tamaño **antes** de leer: `file.text()` cargaría el archivo
    // entero y el tope de 5 MB no serviría de nada.
    if (file.size > MAX_FILE_BYTES) {
      return { error: "too-large", filename };
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      return { error: "read-failed" };
    }
    const inspected = inspectImportUpload({
      filename: file.name,
      byteSize: file.size,
      content,
    });
    if (!inspected.ok) {
      return { error: inspected.error, filename: inspected.filename };
    }
    const parsed = createDelimitedFileParser().parse(content);
    carried = {
      filename: inspected.filename,
      separator: parsed.separator,
      separatorFromDirective: parsed.separatorFromDirective,
      columnCount: parsed.columnCount,
      totalRows: parsed.rows.length,
      totalIssues: parsed.issues.length,
      previewRaw: parsed.rawRows.slice(0, PREVIEW_LIMIT),
    };
  } else if (typeof carriedRaw === "string" && carriedRaw !== "") {
    try {
      carried = JSON.parse(carriedRaw) as CarriedPreview;
    } catch {
      return { error: "no-file" };
    }
  } else {
    return { error: "no-file" };
  }

  const mapping = readMapping(formData, Math.max(carried.columnCount, 1));
  const mapped = mapPreviewRows(carried.previewRaw, mapping);

  return {
    filename: carried.filename,
    separator: carried.separator,
    separatorFromDirective: carried.separatorFromDirective,
    columnCount: carried.columnCount,
    totalRows: carried.totalRows,
    totalIssues: carried.totalIssues,
    mapping,
    carried,
    previewRows: mapped.rows,
    previewIssues: issuesWithSamples(mapped.issues, carried.previewRaw),
  };
}
