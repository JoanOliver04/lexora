import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("@/composition/identity", () => ({ completeAuthCallback: complete }));
const { verify } = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@/composition/account-deletion", () => ({ completeDeletionGoogleChallenge: verify }));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_SITE_URL: "https://lexora.example" } }));
import { GET } from "./route";

function request(query: Record<string, string>) {
  return new NextRequest(`https://forged.example/api/auth/callback?${new URLSearchParams(query)}`, {
    headers: { "x-forwarded-host": "also-forged.example" },
  });
}
describe("PKCE callback trust boundary", () => {
  beforeEach(() => {
    complete.mockReset().mockResolvedValue(true);
  });
  it.each([
    {},
    { code: "x".repeat(2049) },
    { code: "ignored", error: "access_denied", error_description: "private-marker" },
  ])("rejects invalid or denied callbacks before exchange", async (params) => {
    const response = await GET(
      request({ ...params, locale: "es", flow: "google", next: "/es/app/library" }),
    );
    const target = new URL(response.headers.get("location")!);
    expect(target.origin).toBe("https://lexora.example");
    expect(target.pathname).toBe("/es/login");
    expect(target.searchParams.get("error")).toBe("google-unavailable");
    expect(target.searchParams.get("next")).toBe("/es/app/library");
    expect(target.toString()).not.toContain("private-marker");
    expect(complete).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it.each([
    "https://untrusted.example",
    "//untrusted.example",
    "/\\untrusted.example",
    "javascript:alert(1)",
  ])("keeps %s outside the redirect boundary", async (next) => {
    const response = await GET(
      request({ code: "synthetic-code", flow: "google", locale: "en", next }),
    );
    expect(response.headers.get("location")).toBe("https://lexora.example/en/app");
    expect(complete).toHaveBeenCalledWith("synthetic-code");
  });
  it("binds Google deletion returns to the pending browser and owner before showing confirmation", async () => {
    const query = {
      code: "synthetic-code",
      flow: "deletion-google",
      locale: "en",
      next: "/en/app/library",
    };
    const missing = await GET(request(query));
    expect(missing.headers.get("location")).toContain("/en/app/settings?verification=failed");
    expect(complete).not.toHaveBeenCalled();
    const callback = request(query);
    callback.cookies.set("lexora-deletion-google", "synthetic-challenge");
    verify.mockResolvedValueOnce(false);
    expect((await GET(callback)).headers.get("location")).toContain("verification=failed");
    verify.mockResolvedValueOnce(true);
    const verified = await GET(callback);
    expect(verify).toHaveBeenCalledWith("synthetic-code", "synthetic-challenge");
    expect(complete).not.toHaveBeenCalled();
    expect(verified.headers.get("location")).toBe("https://lexora.example/en/app/settings");
    expect(verified.cookies.get("lexora-deletion-google")?.value).toBe("");
  });
  it("preserves an internal destination and ignores forged request hosts", async () => {
    const response = await GET(
      request({
        code: "synthetic-code",
        flow: "google",
        locale: "es",
        next: "/es/app/library?deck=owned",
      }),
    );
    expect(response.headers.get("location")).toBe(
      "https://lexora.example/es/app/library?deck=owned",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("retains email recovery and normalizes an unknown locale", async () => {
    const response = await GET(
      request({ code: "synthetic-code", locale: "unknown", next: "/en/reset-password" }),
    );
    expect(response.headers.get("location")).toBe("https://lexora.example/en/reset-password");
  });
  it("sends confirmed email signups to the localized onboarding entry", async () => {
    const response = await GET(request({ code: "synthetic-code", flow: "signup", locale: "es" }));
    expect(response.headers.get("location")).toBe("https://lexora.example/es/app");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(complete).toHaveBeenCalledWith("synthetic-code");
  });
  it("returns failed signup links to an actionable registration screen", async () => {
    complete.mockResolvedValue(false);
    const response = await GET(
      request({ code: "expired-code", flow: "signup", locale: "en", next: "//foreign.example" }),
    );
    expect(response.headers.get("location")).toBe(
      "https://lexora.example/en/signup?error=confirmation-invalid&next=%2Fen%2Fapp",
    );
  });
  it.each(["false", "throw"])("fails closed on exchange/profile failure: %s", async (outcome) => {
    if (outcome === "throw") complete.mockRejectedValue(new Error("private-profile-failure"));
    else complete.mockResolvedValue(false);
    const response = await GET(request({ code: "synthetic-code", flow: "google", locale: "en" }));
    expect(response.headers.get("location")).toBe(
      "https://lexora.example/en/login?error=google-unavailable&next=%2Fen%2Fapp",
    );
  });
});
