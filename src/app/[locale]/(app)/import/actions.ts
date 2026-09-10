"use server";

import { revalidatePath } from "next/cache";

import { getActiveCourseForCurrentUser } from "@/composition/courses";
import {
  createDelimitedFileParser,
  getImportJobRepositoryForCurrentUser,
} from "@/composition/importing";
import { getLibraryContextForCurrentUser } from "@/composition/library";
import { hashImportContent } from "@/modules/importing/application/content-hash";
import {
  type DuplicateHit,
  planImportDuplicates,
} from "@/modules/importing/application/duplicates";
import { executeImport } from "@/modules/importing/application/execute-import";
import type { ImportJobError } from "@/modules/importing/application/import-job";
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  inspectImportUpload,
  issuesWithSamples,
  mapPreviewRows,
} from "@/modules/importing/application/preview";
import {
  DEFAULT_COLUMN_MAPPING,
  type ColumnMapping,
} from "@/modules/importing/domain/column-mapping";
import {
  type DuplicateStrategy,
  parseDuplicateStrategy,
} from "@/modules/importing/domain/duplicates";
import { sanitizeFilename } from "@/modules/importing/domain/filename";
import type {
  ImportRowIssueCode,
  ParsedImportRow,
  RawImportRow,
} from "@/modules/importing/domain/row";
import type { Separator } from "@/modules/importing/domain/separator";

/**
 * Vista previa (LEX-4.4…4.6) y ejecución del lote (LEX-4.7). El archivo
 * enorme se rechaza **antes** de parsear. `intent=execute` confirma e
 * importa; el resto solo previsualiza. El wizard (LEX-4.8) es presentación:
 * esta acción no conoce los pasos. El resumen con errores (LEX-4.9) viaja
 * en `result.errors`.
 */

const PREVIEW_LIMIT = 50;

interface CarriedPreview {
  filename: string;
  separator: Separator;
  separatorFromDirective: boolean;
  columnCount: number;
  /** Filas tokenizadas del archivo **completo**, para remapear y clasificar. */
  rawRows: RawImportRow[];
  contentHash: string;
}

export interface ImportPreviewState {
  error?:
    | "no-file"
    | "empty-file"
    | "read-failed"
    | "too-large"
    | "too-many-rows"
    | "unavailable"
    | "no-deck"
    | "empty";
  filename?: string;
  separator?: Separator;
  separatorFromDirective?: boolean;
  columnCount?: number;
  /** Recuentos sobre el archivo completo **con el mapeo actual**. */
  totalRows?: number;
  totalIssues?: number;
  newCount?: number;
  duplicateCount?: number;
  duplicateStrategy?: DuplicateStrategy;
  duplicateHits?: DuplicateHit[];
  deckId?: string;
  createReverse?: boolean;
  result?: {
    rowsTotal: number;
    rowsCreated: number;
    rowsSkipped: number;
    rowsDuplicate: number;
    rowsFailed: number;
    errors: ImportJobError[];
  };
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
      rawRows: parsed.rawRows,
      contentHash: hashImportContent(content),
    };
  } else if (typeof carriedRaw === "string" && carriedRaw !== "") {
    try {
      carried = JSON.parse(carriedRaw) as CarriedPreview;
    } catch {
      return { error: "no-file" };
    }
    if (!Array.isArray(carried.rawRows) || typeof carried.contentHash !== "string") {
      return { error: "no-file" };
    }
  } else {
    return { error: "no-file" };
  }

  if (carried.rawRows.length > MAX_ROWS) {
    return { error: "too-many-rows", filename: carried.filename };
  }

  if (String(formData.get("intent") ?? "") === "execute") {
    return executeFromForm(formData, carried);
  }

  const mapping = readMapping(formData, Math.max(carried.columnCount, 1));
  const mapped = mapPreviewRows(carried.rawRows, mapping);
  const previewRaw = carried.rawRows.slice(0, PREVIEW_LIMIT);
  const previewMapped = mapPreviewRows(previewRaw, mapping);
  const strategy = parseDuplicateStrategy(formData.get("duplicateStrategy"));

  const library = await getLibraryContextForCurrentUser();
  const course = await getActiveCourseForCurrentUser();
  if (!library || !course) {
    return { error: "unavailable", filename: carried.filename };
  }

  const plan = await planImportDuplicates({
    ownerId: library.ownerId,
    courseId: course.id,
    validRows: mapped.rows,
    invalidCount: mapped.issues.length,
    strategy,
    concepts: library.concepts,
  });

  return {
    filename: carried.filename,
    separator: carried.separator,
    separatorFromDirective: carried.separatorFromDirective,
    columnCount: carried.columnCount,
    totalRows: mapped.rows.length,
    totalIssues: mapped.issues.length,
    newCount: plan.newCount,
    duplicateCount: plan.duplicateCount,
    duplicateStrategy: plan.strategy,
    duplicateHits: plan.hits,
    deckId: String(formData.get("deckId") ?? ""),
    createReverse: formData.get("createReverse") === "1",
    mapping,
    carried,
    previewRows: previewMapped.rows,
    previewIssues: issuesWithSamples(previewMapped.issues, previewRaw),
  };
}

async function executeFromForm(
  formData: FormData,
  carried: CarriedPreview,
): Promise<ImportPreviewState> {
  const mapping = readMapping(formData, Math.max(carried.columnCount, 1));
  const strategy = parseDuplicateStrategy(formData.get("duplicateStrategy"));
  const deckId = String(formData.get("deckId") ?? "");
  const createReverse = formData.get("createReverse") === "1";
  const locale = String(formData.get("locale") ?? "es");

  const library = await getLibraryContextForCurrentUser();
  const course = await getActiveCourseForCurrentUser();
  const jobs = await getImportJobRepositoryForCurrentUser();
  if (!library || !course || !jobs) {
    return { error: "unavailable", filename: carried.filename };
  }

  const outcome = await executeImport(
    {
      ownerId: library.ownerId,
      courseId: course.id,
      deckId,
      filename: carried.filename,
      contentHash: carried.contentHash,
      mapping,
      strategy,
      createReverse,
      rawRows: carried.rawRows,
      locale,
    },
    {
      jobs,
      decks: library.decks,
      concepts: library.concepts,
      practiceItems: library.practiceItems,
      tags: library.tags,
    },
  );

  if (!outcome.ok) {
    return { error: outcome.error, filename: carried.filename, carried };
  }

  revalidatePath(`/${locale}/concepts`);
  revalidatePath(`/${locale}/decks`);
  revalidatePath(`/${locale}/import`);

  const previewRaw = carried.rawRows.slice(0, PREVIEW_LIMIT);
  const previewMapped = mapPreviewRows(previewRaw, mapping);

  return {
    filename: carried.filename,
    separator: carried.separator,
    separatorFromDirective: carried.separatorFromDirective,
    columnCount: carried.columnCount,
    mapping,
    carried,
    duplicateStrategy: strategy,
    deckId,
    createReverse,
    previewRows: previewMapped.rows,
    previewIssues: issuesWithSamples(previewMapped.issues, previewRaw),
    result: {
      rowsTotal: outcome.result.rowsTotal,
      rowsCreated: outcome.result.rowsCreated,
      rowsSkipped: outcome.result.rowsSkipped,
      rowsDuplicate: outcome.result.rowsDuplicate,
      rowsFailed: outcome.result.rowsFailed,
      errors: outcome.result.errors,
    },
  };
}
