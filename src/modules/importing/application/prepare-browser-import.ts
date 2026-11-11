import type { DuplicateHit } from "./duplicates";
import {
  IMPORT_BATCH_BYTES,
  IMPORT_BATCH_ROWS,
  ImportTransferError,
  persistenceRecordBytes,
  preparePersistenceRecords,
  type ImportTransferRecord,
  type ImportTransferPort,
} from "./import-transfer";
import { mapPreviewRows, previewRowSample } from "./preview";
import type { ColumnMapping } from "../domain/column-mapping";
import type { ParsedImportRow, RawImportRow } from "../domain/row";
import type { ImportPersistErrorCode } from "./import-job";

export interface PreparedBrowserImport {
  records: ImportTransferRecord[];
  previewRows: ParsedImportRow[];
  previewIssues: { rowNumber: number; code: ImportPersistErrorCode; sample: string }[];
  validCount: number;
  issueCount: number;
  newCount: number;
  duplicateCount: number;
  duplicateHits: DuplicateHit[];
}

/** Pack by actual prepared bytes as well as count, including JSON punctuation. */
export function nextImportBatch(
  records: ImportTransferRecord[],
  offset: number,
  locale: string,
): ImportTransferRecord[] {
  const batch: ImportTransferRecord[] = [];
  let bytes = 2;
  for (let index = offset; index < records.length && batch.length < IMPORT_BATCH_ROWS; index++) {
    const record = records[index]!;
    const size = persistenceRecordBytes(record, locale) + (batch.length ? 1 : 0);
    if (bytes + size > IMPORT_BATCH_BYTES) {
      if (!batch.length) throw new ImportTransferError("invalid-input");
      break;
    }
    batch.push(record);
    bytes += size;
  }
  return batch;
}

export async function prepareBrowserImport(input: {
  rawRows: RawImportRow[];
  mapping: ColumnMapping;
  courseId: string;
  locale: string;
  transfer: ImportTransferPort;
  yieldControl: () => Promise<void>;
  signal: AbortSignal;
}): Promise<PreparedBrowserImport> {
  const records: ImportTransferRecord[] = [],
    previewRows: ParsedImportRow[] = [];
  const previewIssues: PreparedBrowserImport["previewIssues"] = [];
  for (let start = 0; start < input.rawRows.length; start += 50) {
    input.signal.throwIfAborted();
    const slice = input.rawRows.slice(start, start + 50);
    const mapped = mapPreviewRows(slice, input.mapping);
    const rows = new Map(mapped.rows.map((row) => [row.rowNumber, row]));
    const issues = new Map(mapped.issues.map((issue) => [issue.rowNumber, issue.code]));
    for (const raw of slice) {
      const row = rows.get(raw.rowNumber);
      const sample = previewRowSample(raw.columns);
      let record: ImportTransferRecord;
      if (!row) {
        record = {
          kind: "error",
          rowNumber: raw.rowNumber,
          code: issues.get(raw.rowNumber) ?? "rejected",
          sample,
        };
      } else if ([row.front, row.back, ...row.tags].some((field) => field.includes("\0"))) {
        record = { kind: "error", rowNumber: raw.rowNumber, code: "rejected", sample };
      } else {
        const prepared = preparePersistenceRecords(
          [{ ...row, kind: "valid", sample }],
          input.locale,
        )[0]!;
        record =
          prepared.kind === "error"
            ? { kind: "error", rowNumber: raw.rowNumber, code: prepared.code, sample }
            : { ...prepared, tags: prepared.tags.map((tag) => tag.displayName) };
      }
      records.push(record);
      if (start === 0) {
        if (record.kind === "valid") previewRows.push(record);
        else previewIssues.push({ rowNumber: record.rowNumber, code: record.code, sample });
      }
    }
    await input.yieldControl();
  }

  const valid = records.filter((record) => record.kind === "valid");
  const matches = new Map<number, string[]>();
  const keys = new Map<number, string>();
  for (let start = 0; start < valid.length; start += IMPORT_BATCH_ROWS) {
    input.signal.throwIfAborted();
    const response = await input.transfer(
      {
        action: "duplicates",
        courseId: input.courseId,
        rows: valid
          .slice(start, start + IMPORT_BATCH_ROWS)
          .map(({ rowNumber, front }) => ({ rowNumber, front })),
      },
      input.signal,
    );
    if (!response.ok) throw new ImportTransferError(response.error);
    if (!("matches" in response)) throw new ImportTransferError("unavailable");
    const expected = new Set(
      valid.slice(start, start + IMPORT_BATCH_ROWS).map((row) => row.rowNumber),
    );
    if (response.matches.length !== expected.size) throw new ImportTransferError("unavailable");
    for (const match of response.matches) {
      if (!expected.delete(match.rowNumber)) throw new ImportTransferError("unavailable");
      keys.set(match.rowNumber, match.canonicalKey);
      if (match.existingTitles.length) matches.set(match.rowNumber, match.existingTitles);
    }
  }

  const groups = new Map<string, number[]>();
  for (const row of valid) {
    const key = keys.get(row.rowNumber)!,
      group = groups.get(key) ?? [];
    group.push(row.rowNumber);
    groups.set(key, group);
  }
  const seen = new Set<string>(),
    duplicateHits: DuplicateHit[] = [];
  let duplicateCount = 0;
  for (const row of valid) {
    const key = keys.get(row.rowNumber)!;
    if (matches.has(row.rowNumber) || seen.has(key)) {
      duplicateCount++;
      if (duplicateHits.length < 20)
        duplicateHits.push({
          rowNumber: row.rowNumber,
          front: row.front,
          existingTitles: matches.get(row.rowNumber) ?? [],
          otherFileRows: (groups.get(key) ?? [])
            .filter((number) => number !== row.rowNumber)
            .slice(0, 20),
        });
    }
    seen.add(key);
  }
  return {
    records,
    previewRows,
    previewIssues,
    validCount: valid.length,
    issueCount: records.length - valid.length,
    duplicateCount,
    newCount: valid.length - duplicateCount,
    duplicateHits,
  };
}
