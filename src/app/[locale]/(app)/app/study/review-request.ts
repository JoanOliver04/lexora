import { REVIEW_FIELDS, reviewResponseSchema, type ReviewFormState } from "./review-state";

export const REVIEW_TIMEOUT_MS = 15_000;

/** One explicit attempt. Abort is an unknown outcome, never a database rollback. */
export async function submitStudyReview(
  _previous: ReviewFormState,
  data: FormData,
): Promise<ReviewFormState> {
  const requestId = String(data.get("idempotencyKey") ?? "");
  if (!navigator.onLine) return { error: "offline", requestId };
  const controller = new AbortController();
  let abortedFor: "offline" | "timeout" = "timeout";
  const offline = () => {
    abortedFor = "offline";
    controller.abort();
  };
  window.addEventListener("offline", offline);
  const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
  try {
    const body = new URLSearchParams();
    for (const name of REVIEW_FIELDS) body.set(name, String(data.get(name) ?? ""));
    const response = await fetch("/api/study/reviews", {
      method: "POST",
      body,
      signal: controller.signal,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    const parsed = reviewResponseSchema.safeParse(await response.json());
    if (controller.signal.aborted) return { error: abortedFor, requestId };
    if (!parsed.success || parsed.data.requestId !== requestId)
      return { error: "generic", requestId };
    if (
      "receipt" in parsed.data &&
      (!response.ok || parsed.data.receipt.rating !== data.get("rating"))
    )
      return { error: "generic", requestId };
    return parsed.data;
  } catch {
    return {
      error: controller.signal.aborted ? abortedFor : !navigator.onLine ? "offline" : "generic",
      requestId,
    };
  } finally {
    clearTimeout(timer);
    window.removeEventListener("offline", offline);
  }
}
