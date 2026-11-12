import { describe, expect, it, vi } from "vitest";
import { beginGoogleSignIn } from "./google-sign-in";

const callback = "https://lexora.example/api/auth/callback?locale=es&flow=google";
describe("Personal Google entry", () => {
  it("does not initiate a disabled provider", async () => {
    const begin = vi.fn();
    expect(await beginGoogleSignIn({ available: async () => false, begin }, callback)).toEqual({
      ok: false,
      error: "google-unavailable",
    });
    expect(begin).not.toHaveBeenCalled();
  });
  it("returns the gateway's validated authorization URL", async () => {
    const begin = vi.fn().mockResolvedValue("https://auth.example/authorize");
    expect(await beginGoogleSignIn({ available: async () => true, begin }, callback)).toEqual({
      ok: true,
      url: "https://auth.example/authorize",
    });
    expect(begin).toHaveBeenCalledWith(callback);
  });
  it.each(["availability", "initiation"])("sanitizes %s failures", async (stage) => {
    const failure = async () => {
      throw new Error("remote-private-details");
    };
    expect(
      await beginGoogleSignIn(
        {
          available: stage === "availability" ? failure : async () => true,
          begin: failure,
        },
        callback,
      ),
    ).toEqual({ ok: false, error: "google-unavailable" });
  });
});
