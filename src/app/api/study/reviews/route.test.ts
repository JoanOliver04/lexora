import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const { save } = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_SITE_URL: "https://lexora.example" } }));
vi.mock("@/app/[locale]/(app)/app/study/review-handler", () => ({ saveStudyReviewRequest: save }));
const fields = {
  locale: "es",
  sessionId: "session",
  practiceItemId: "item",
  idempotencyKey: "key",
  rating: "good",
  expectedRevision: "new",
};
function request(
  body = new URLSearchParams(fields).toString(),
  origin: string | null = "https://lexora.example",
  contentType = "application/x-www-form-urlencoded",
) {
  const headers = new Headers({ "content-type": contentType });
  if (origin !== null) headers.set("origin", origin);
  return new Request("https://lexora.example/api/study/reviews", { method: "POST", headers, body });
}
beforeEach(() =>
  save
    .mockReset()
    .mockResolvedValue({ requestId: "key", receipt: { rating: "good", replayed: false } }),
);
describe("review write endpoint", () => {
  it("delegates bounded intent and marks its response private/no-store", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    expect(Object.fromEntries(save.mock.calls[0]![1])).toEqual(fields);
  });
  it.each([
    null,
    "null",
    "https://evil.example",
    "https://lexora.example.evil",
    "http://lexora.example",
  ])("rejects origin %j before accessing identity or data", async (origin) => {
    const req = request(undefined, origin);
    req.headers.set("host", "evil.example");
    req.headers.set("x-forwarded-host", "evil.example");
    expect((await POST(req)).status).toBe(403);
    expect(save).not.toHaveBeenCalled();
  });
  it("rejects invalid content types, duplicate or missing fields before mutation", async () => {
    expect((await POST(request("{}", undefined, "application/json"))).status).toBe(415);
    expect((await POST(request("rating=good"))).status).toBe(400);
    expect((await POST(request(new URLSearchParams(fields) + "&rating=easy"))).status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  });
  it("ignores forged metadata rather than forwarding it", async () => {
    await POST(
      request(
        new URLSearchParams({ ...fields, ownerId: "forged", dueAt: "2099-01-01" }).toString(),
      ),
    );
    expect(Object.fromEntries(save.mock.calls[0]![1])).toEqual(fields);
  });
  it("limits actual streamed bytes even without Content-Length", async () => {
    const req = request("x".repeat(2049));
    expect(req.headers.has("content-length")).toBe(false);
    expect((await POST(req)).status).toBe(413);
    expect(save).not.toHaveBeenCalled();
  });
  it.each([
    ["unauthenticated", 401],
    ["generic", 503],
    ["revision-conflict", 409],
    ["card-changed", 409],
  ])("returns %s safely with status %i", async (error, status) => {
    save.mockResolvedValue({ requestId: "key", error });
    const response = await POST(request());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ requestId: "key", error });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
vi.mock("@/composition/deployment", () => ({ isPrivateAccessEnabled: () => true }));
