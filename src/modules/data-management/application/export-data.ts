import type { DataExportFailure, ExportSnapshot } from "../domain/data-export";
export class DataExportError extends Error {
  constructor(public readonly kind: DataExportFailure) {
    super(kind);
    this.name = "DataExportError";
  }
}
export interface DataExportRepository {
  readOwnData(): Promise<ExportSnapshot>;
}
export async function exportOwnData(repository: DataExportRepository, ownerId: string) {
  if (!ownerId.trim()) return { ok: false as const, error: "unauthenticated" as const };
  try {
    return { ok: true as const, snapshot: await repository.readOwnData() };
  } catch (error) {
    if (!(error instanceof DataExportError)) throw error;
    return { ok: false as const, error: error.kind };
  }
}
