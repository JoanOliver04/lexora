import { z } from "zod";
import { MAX_EXPORT_BYTES } from "../domain/data-export";

export const RESTORE_CHUNK_CHARS = 256 * 1024;
export const RESTORE_HTTP_BYTES = 3 * 1024 * 1024;
export const restoreSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);

const id = z.uuid();
export const restoreRequestSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("begin"),
      id,
      bytes: z.number().int().min(1).max(MAX_EXPORT_BYTES),
      sha256: restoreSha256Schema,
    })
    .strict(),
  z
    .object({
      action: z.literal("append"),
      id,
      index: z.number().int().min(0).max(127),
      text: z
        .string()
        .min(1)
        .max(RESTORE_CHUNK_CHARS)
        .refine((value) => value.isWellFormed()),
    })
    .strict(),
  z.object({ action: z.literal("commit"), id, confirmation: z.literal("RESTORE") }).strict(),
  z.object({ action: z.literal("cancel"), id }).strict(),
]);
export type RestoreRequest = z.infer<typeof restoreRequestSchema>;

export const restoreFailureSchema = z.enum([
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
]);
export type RestoreFailure = z.infer<typeof restoreFailureSchema>;
export const restoreProgressSchema = z
  .object({
    state: z.enum(["uploading", "restored", "cancelled"]),
    next: z.number().int().min(0).max(128),
    rows: z.number().int().min(0).max(50000),
  })
  .strict();
export type RestoreProgress = z.infer<typeof restoreProgressSchema>;
export const restoreResponseSchema = z.union([
  z.object({ ok: z.literal(true), progress: restoreProgressSchema }).strict(),
  z.object({ ok: z.literal(false), error: restoreFailureSchema }).strict(),
]);
export type RestoreResponse = z.infer<typeof restoreResponseSchema>;

export class RestoreError extends Error {
  constructor(readonly kind: RestoreFailure) {
    super(kind);
  }
}
