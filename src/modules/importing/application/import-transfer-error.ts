export type ImportTransferFailure =
  "unauthenticated" | "not-found" | "invalid-input" | "conflict" | "cooldown" | "unavailable";

export class ImportTransferError extends Error {
  constructor(readonly kind: ImportTransferFailure) {
    super(kind);
    this.name = "ImportTransferError";
  }
}
