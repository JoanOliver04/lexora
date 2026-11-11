import type { DuplicateHit } from "@/modules/importing/application/duplicates";
import type { TokenizedImport } from "@/modules/importing/application/delimited-file-parser";
import type {
  ImportJobError,
  ImportPersistErrorCode,
} from "@/modules/importing/application/import-job";
import type { PreparedBrowserImport } from "@/modules/importing/application/prepare-browser-import";
import type { ColumnMapping } from "@/modules/importing/domain/column-mapping";
import type { DuplicateStrategy } from "@/modules/importing/domain/duplicates";
import type { ParsedImportRow } from "@/modules/importing/domain/row";
import type { Separator } from "@/modules/importing/domain/separator";

export interface CarriedPreview extends TokenizedImport {
  filename: string;
  contentHash: string;
  originalBytes: number;
}
export interface ImportPreviewState {
  error?:
    | "no-file"
    | "empty-file"
    | "read-failed"
    | "too-large"
    | "too-many-rows"
    | "too-many-columns"
    | "unavailable"
    | "no-deck"
    | "empty";
  filename?: string;
  separator?: Separator;
  separatorFromDirective?: boolean;
  columnCount?: number;
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
  carried?: CarriedPreview;
  prepared?: PreparedBrowserImport;
  previewRows?: ParsedImportRow[];
  previewIssues?: { rowNumber: number; code: ImportPersistErrorCode; sample: string }[];
}

export function readImportMapping(
  form: FormData,
  columns: number,
  fallback?: ColumnMapping,
): ColumnMapping {
  const index = (key: string, initial: number) => {
    const value = Number.parseInt(String(form.get(key) ?? ""), 10);
    return Number.isInteger(value) && value >= 0 && value < columns
      ? value
      : Math.min(Math.max(initial, 0), columns - 1);
  };
  const submittedTags = form.get("tagsColumn");
  const fallbackTags = fallback ? fallback.tags : columns > 2 ? 2 : null;
  const parsedTags = Number.parseInt(String(submittedTags ?? ""), 10);
  const tags =
    submittedTags === "none"
      ? null
      : Number.isInteger(parsedTags) && parsedTags >= 0 && parsedTags < columns
        ? parsedTags
        : fallbackTags !== null && fallbackTags >= 0 && fallbackTags < columns
          ? fallbackTags
          : null;
  return {
    front: index("frontColumn", fallback?.front ?? 0),
    back: index("backColumn", fallback?.back ?? 1),
    tags,
  };
}
