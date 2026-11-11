import { z } from "zod";

import type { SaveSessionReviewReason } from "@/modules/study/application/save-session-review";
import { REVIEW_RATINGS } from "@/modules/study/application/study-card";

const serverErrors = [
  "invalid-input",
  "not-found",
  "inactive-session",
  "invalid-timezone",
  "card-changed",
  "idempotency-conflict",
  "revision-conflict",
  "scheduler-mismatch",
  "generic",
  "unauthenticated",
] as const satisfies readonly (SaveSessionReviewReason | "generic" | "unauthenticated")[];

export const reviewResponseSchema = z.union([
  z
    .object({
      requestId: z.string(),
      receipt: z.object({ rating: z.enum(REVIEW_RATINGS), replayed: z.boolean() }),
    })
    .strict(),
  z.object({ requestId: z.string(), error: z.enum(serverErrors) }).strict(),
]);
type ServerResponse = z.infer<typeof reviewResponseSchema>;
export interface ReviewFormState {
  receipt?: Extract<ServerResponse, { receipt: unknown }>["receipt"];
  error?: (typeof serverErrors)[number] | "offline" | "timeout";
  requestId?: string;
}

export const REVIEW_FIELDS = [
  "locale",
  "sessionId",
  "practiceItemId",
  "idempotencyKey",
  "rating",
  "expectedRevision",
] as const;
