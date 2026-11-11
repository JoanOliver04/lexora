import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/composition/deployment", () => ({ isPrivateAccessEnabled: () => true }));
const { remove } = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_SITE_URL: "https://lexora.example" } }));
vi.mock("@/composition/account-deletion", () => ({ deleteCurrentAccount: remove }));
import { POST } from "./route";
function request(body = "{}", origin = "https://lexora.example", type = "application/json") {
  return new Request("https://lexora.example/api/account/delete", {
    method: "POST",
    headers: { origin, "content-type": type },
    body,
  });
}
describe("Private deletion endpoint", () => {
  beforeEach(() => remove.mockReset().mockResolvedValue({ ok: false, error: "unauthenticated" }));
  it("rejects cross-site, missing origin, oversized and malformed requests before Auth", async () => {
    for (const [req, status] of [
      [request("{}", "https://foreign.example"), 403],
      [request("{}", ""), 403],
      [request("{}", undefined, "text/plain"), 415],
      [request("x".repeat(2049)), 413],
      [request("{bad"), 400],
    ] as const)
      expect((await POST(req)).status).toBe(status);
    expect(remove).not.toHaveBeenCalled();
  });
  it("uses stable private errors and real HTTP statuses", async () => {
    for (const [error, status] of [
      ["unauthenticated", 401],
      ["invalid-input", 400],
      ["invalid-credentials", 403],
      ["reauth-required", 401],
      ["mfa-required", 403],
      ["cooldown", 429],
      ["unavailable", 503],
    ] as const) {
      remove.mockResolvedValue({ ok: false, error });
      const response = await POST(request());
      expect(response.status).toBe(status);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({ ok: false, error });
      if (status === 429) expect(response.headers.get("retry-after")).toBe("60");
    }
  });
  it("confirms only a committed deletion", async () => {
    remove.mockResolvedValue({ ok: true });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
