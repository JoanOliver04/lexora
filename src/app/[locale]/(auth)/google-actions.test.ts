import { beforeEach, describe, expect, it, vi } from "vitest";
const { begin, redirectTo } = vi.hoisted(() => ({ begin: vi.fn(), redirectTo: vi.fn() }));
vi.mock("@/composition/identity", () => ({ signInGoogleVisitor: begin }));
vi.mock("@/env/client", () => ({ clientEnv: { NEXT_PUBLIC_SITE_URL: "https://lexora.example" } }));
vi.mock("next/navigation", () => ({ redirect: redirectTo }));
import { googleLoginAction } from "./actions";

function form(locale: string, next: string) {
  const data = new FormData();
  data.set("locale", locale);
  data.set("next", next);
  data.set("ownerId", "forged-owner");
  data.set("redirectTo", "https://untrusted.example");
  return data;
}
describe("Google Server Action", () => {
  beforeEach(() => {
    begin.mockReset().mockResolvedValue({ ok: false, error: "google-unavailable" });
    redirectTo.mockReset().mockImplementation(() => {
      throw new Error("redirect-sentinel");
    });
  });
  it("derives the callback from the configured origin and ignores forged identity/target fields", async () => {
    expect(await googleLoginAction({}, form("en", "/en/app/library"))).toEqual({
      error: "google-unavailable",
    });
    const callback = new URL(begin.mock.calls[0]![0] as string);
    expect(callback.origin).toBe("https://lexora.example");
    expect(callback.pathname).toBe("/api/auth/callback");
    expect(Object.fromEntries(callback.searchParams)).toEqual({
      locale: "en",
      flow: "google",
      next: "/en/app/library",
    });
    expect(redirectTo).not.toHaveBeenCalled();
  });
  it("normalizes untrusted locale and destination before initiation", async () => {
    await googleLoginAction({}, form("//untrusted.example", "https://untrusted.example"));
    const callback = new URL(begin.mock.calls[0]![0] as string);
    expect(callback.searchParams.get("locale")).toBe("es");
    expect(callback.searchParams.get("next")).toBe("/es/app");
  });
  it("redirects only after the application gateway confirms initiation", async () => {
    begin.mockResolvedValue({ ok: true, url: "https://auth.example/authorize" });
    await expect(googleLoginAction({}, form("es", "/es/app"))).rejects.toThrow("redirect-sentinel");
    expect(redirectTo).toHaveBeenCalledExactlyOnceWith("https://auth.example/authorize");
  });
});
