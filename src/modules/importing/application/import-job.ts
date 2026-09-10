/**
 * Puerto del trabajo de importación (LEX-4.7, tablas de LEX-4.3).
 *
 * Un trabajo es un intento: destino, hash, mapeo, estado y contadores. Los
 * fallos por fila se escriben una vez y no se editan. El archivo en sí no se
 * guarda —solo `contentHash`.
 */

export type ImportJobStatus = "pending" | "mapping" | "importing" | "completed" | "failed";

export type ImportPersistErrorCode =
  | "too_few_columns"
  | "too_many_columns"
  | "front_empty"
  | "back_empty"
  | "front_too_long"
  | "back_too_long"
  | "tags_too_long"
  | "rejected";

export interface ImportJob {
  id: string;
  courseId: string;
  ownerId: string;
  deckId: string | null;
  originalFilename: string;
  contentHash: string;
  status: ImportJobStatus;
  rowsTotal: number;
  rowsCreated: number;
  rowsSkipped: number;
  rowsDuplicate: number;
  rowsFailed: number;
}

export interface ImportJobRepository {
  create(input: {
    ownerId: string;
    courseId: string;
    deckId: string;
    originalFilename: string;
    contentHash: string;
    mappingConfig: Record<string, unknown>;
  }): Promise<ImportJob>;
  complete(input: {
    ownerId: string;
    jobId: string;
    rowsTotal: number;
    rowsCreated: number;
    rowsSkipped: number;
    rowsDuplicate: number;
    rowsFailed: number;
  }): Promise<ImportJob>;
  fail(input: { ownerId: string; jobId: string }): Promise<void>;
  addError(input: {
    ownerId: string;
    jobId: string;
    rowNumber: number;
    code: ImportPersistErrorCode;
    message: string;
    rowSample: string | null;
  }): Promise<void>;
}
