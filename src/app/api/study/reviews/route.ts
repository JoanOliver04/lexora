import { clientEnv } from "@/env/client";
import { isPrivateAccessEnabled } from "@/composition/deployment";
import { saveStudyReviewRequest } from "@/app/[locale]/(app)/app/study/review-handler";
import { REVIEW_FIELDS, type ReviewFormState } from "@/app/[locale]/(app)/app/study/review-state";

const MAX_BYTES = 2048;
function reply(body: ReviewFormState, status: number) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

/** Cookie-authenticated write: unlike Server Actions, HTTP cancellation is explicit. */
export async function POST(request: Request) {
  if (!isPrivateAccessEnabled()) return reply({ error: "unauthenticated", requestId: "" }, 403);
  // Never trust a supplied Host/forwarded header to establish the allowed origin.
  if (request.headers.get("origin") !== new URL(clientEnv.NEXT_PUBLIC_SITE_URL).origin)
    return reply({ error: "invalid-input", requestId: "" }, 403);
  if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded")
    return reply({ error: "invalid-input", requestId: "" }, 415);
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "invalid-input", requestId: "" }, 400);
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return reply({ error: "invalid-input", requestId: "" }, 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch {
    return reply({ error: "generic", requestId: "" }, 400);
  } finally {
    reader.releaseLock();
  }
  const params = new URLSearchParams(text);
  const data = new FormData();
  for (const name of REVIEW_FIELDS) {
    if (params.getAll(name).length !== 1)
      return reply({ error: "invalid-input", requestId: "" }, 400);
    data.set(name, params.get(name)!);
  }
  const result = await saveStudyReviewRequest({}, data);
  return reply(
    result,
    result.receipt
      ? 200
      : result.error === "unauthenticated"
        ? 401
        : result.error === "generic"
          ? 503
          : 409,
  );
}
