// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_TIMEOUT_MS, submitStudyReview } from "./review-request";

const key = "60000000-0000-4000-8000-000000000001";
function form() {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    locale: "es",
    sessionId: "session",
    practiceItemId: "item",
    idempotencyKey: key,
    rating: "good",
    expectedRevision: "7",
    ownerId: "forged",
  }))
    data.set(name, value);
  return data;
}
const receipt = { requestId: key, receipt: { rating: "good", replayed: false } };
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  fetchMock.mockReset().mockResolvedValue(Response.json(receipt));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("review HTTP transport", () => {
  it("sends only intent with same-origin credentials and validates the acknowledgement", async () => {
    expect(await submitStudyReview({}, form())).toEqual(receipt);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/study/reviews");
    expect(options).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
    expect(options.body.get("ownerId")).toBeNull();
    expect(options.body.get("expectedRevision")).toBe("7");
    expect(options.signal.aborted).toBe(false);
  });
  it("never sends or queues an offline attempt", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await submitStudyReview({}, form())).toEqual({ error: "offline", requestId: key });
    window.dispatchEvent(new Event("online"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { requestId: "another-key", receipt: receipt.receipt },
    { requestId: key, receipt: { rating: "easy", replayed: false } },
    { requestId: key, receipt: { rating: "good", replayed: "yes" } },
    { requestId: key, error: "untrusted-error" },
    { ...receipt, error: "generic" },
    { status: "ok" },
  ])("does not claim success from an invalid or mismatched reply: %j", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    expect(await submitStudyReview({}, form())).toEqual({ error: "generic", requestId: key });
  });
  it("does not accept a success body on an unsuccessful HTTP response", async () => {
    fetchMock.mockResolvedValue(Response.json(receipt, { status: 503 }));
    expect(await submitStudyReview({}, form())).toEqual({ error: "generic", requestId: key });
  });
  it("returns safe typed conflict and expired-identity errors without losing the key", async () => {
    for (const error of ["revision-conflict", "card-changed", "unauthenticated"]) {
      fetchMock.mockResolvedValue(Response.json({ requestId: key, error }, { status: 409 }));
      expect(await submitStudyReview({}, form())).toEqual({ requestId: key, error });
    }
  });
  it("handles broken JSON and transport failures without leaking details", async () => {
    fetchMock.mockResolvedValue(new Response("PRIVATE_RESPONSE"));
    expect(await submitStudyReview({}, form())).toEqual({ error: "generic", requestId: key });
    fetchMock.mockRejectedValue(new Error("PRIVATE_NETWORK_DETAILS"));
    expect(await submitStudyReview({}, form())).toEqual({ error: "generic", requestId: key });
  });
  it("aborts a timed-out attempt, releases its timer and retries the identical intent", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) =>
          options.signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    const data = form();
    const pending = submitStudyReview({}, data);
    await vi.advanceTimersByTimeAsync(REVIEW_TIMEOUT_MS);
    expect(await pending).toEqual({ error: "timeout", requestId: key });
    expect(fetchMock.mock.calls[0]![1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    fetchMock.mockResolvedValue(
      Response.json({ ...receipt, receipt: { ...receipt.receipt, replayed: true } }),
    );
    expect((await submitStudyReview({}, data)).receipt?.replayed).toBe(true);
    expect(fetchMock.mock.calls[0]![1].body.toString()).toBe(
      fetchMock.mock.calls[1]![1].body.toString(),
    );
  });
  it("aborts on connection loss and never automatically retries on reconnect", async () => {
    fetchMock.mockImplementationOnce(
      (_url, options: RequestInit) =>
        new Promise((_resolve, reject) =>
          options.signal!.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        ),
    );
    const pending = submitStudyReview({}, form());
    window.dispatchEvent(new Event("offline"));
    expect(await pending).toEqual({ error: "offline", requestId: key });
    window.dispatchEvent(new Event("online"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
