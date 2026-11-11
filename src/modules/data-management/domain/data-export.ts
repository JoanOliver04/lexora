export const EXPORT_ENTITIES = [
  "profiles",
  "languages",
  "courses",
  "course_settings",
  "decks",
  "concepts",
  "deck_concepts",
  "practice_items",
  "tags",
  "concept_tags",
  "learning_states",
  "review_logs",
  "study_sessions",
  "import_jobs",
  "import_job_errors",
] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export type ExportFormat = "json" | "csv";
export type ExportValue =
  null | boolean | number | string | ExportValue[] | { [key: string]: ExportValue };
export type ExportPayload = Record<ExportEntity, Record<string, ExportValue>[]>;
export interface ExportSnapshot {
  exportedAt: string;
  rows: number;
  /** Opaque JSON text: parsing it through the SDK would round numeric literals. */
  payloadText: string;
}
export type DataExportFailure =
  | "unauthenticated"
  | "invalid-input"
  | "cooldown"
  | "too-large"
  | "unavailable"
  | "interrupted"
  | "integrity";
export const MAX_EXPORT_BYTES = 16 * 1024 * 1024;
export const MAX_ARTIFACT_BYTES = 64 * 1024 * 1024;
