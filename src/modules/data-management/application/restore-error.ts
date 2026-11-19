export const RESTORE_FAILURES = [
  "unauthenticated",
  "reauthenticate",
  "invalid",
  "integrity",
  "version",
  "wrongAccount",
  "tooLarge",
  "conflict",
  "cooldown",
  "unavailable",
] as const;

export type RestoreFailure = (typeof RESTORE_FAILURES)[number];

export class RestoreError extends Error {
  constructor(readonly kind: RestoreFailure) {
    super(kind);
  }
}
