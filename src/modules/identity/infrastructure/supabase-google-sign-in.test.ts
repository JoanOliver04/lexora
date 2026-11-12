import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createSupabaseGoogleSignIn, googleProviderAvailable } from "./supabase-google-sign-in";
import type { Database } from "@/shared/infrastructure/supabase/database.types";

const backend = "http://127.0.0.1:54321";
const callback = "https://lexora.example/api/auth/callback?locale=en&flow=google&next=%2Fen%2Fapp";
function client() {
  return createClient<Database>(backend, "test-key", {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "pkce",
    },
  });
}
afterEach(() => vi.restoreAllMocks());
describe("Public Google availability", () => {
  it("fetches only public flags without an identity, with a bounded shared cache", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ external: { google: true } }));
    expect(await googleProviderAvailable(backend, "public-placeholder", request)).toBe(true);
    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toBe(`${backend}/auth/v1/settings`);
    expect(init).toMatchObject({
      headers: { apikey: "public-placeholder" },
      credentials: "omit",
      cache: "force-cache",
      next: { revalidate: 60 },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([{ external: { google: false } }, {}, { external: { google: "true" } }])(
    "hides an unavailable or invalid provider: %j",
    async (payload) => {
      expect(
        await googleProviderAvailable(
          backend,
          "public-placeholder",
          vi.fn().mockResolvedValue(Response.json(payload)),
        ),
      ).toBe(false);
    },
  );
  it("fails closed on HTTP or network errors", async () => {
    expect(
      await googleProviderAvailable(
        backend,
        "public-placeholder",
        vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
      ),
    ).toBe(false);
    expect(
      await googleProviderAvailable(
        backend,
        "public-placeholder",
        vi.fn().mockRejectedValue(new Error("offline")),
      ),
    ).toBe(false);
  });
});
describe("Google SDK initiation", () => {
  it("uses real SDK PKCE and only basic identity scopes, with no network call", async () => {
    const sdk = client();
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Unexpected network call"));
    const result = new URL(
      await createSupabaseGoogleSignIn(sdk, backend, "test-key").begin(callback),
    );
    expect(result.origin).toBe(backend);
    expect(result.searchParams.get("provider")).toBe("google");
    expect(result.searchParams.get("redirect_to")).toBe(callback);
    expect(result.searchParams.get("code_challenge_method")?.toLowerCase()).toBe("s256");
    expect(result.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.searchParams.get("scopes")).toBe("openid email profile");
    expect(result.searchParams.get("prompt")).toBe("select_account");
    expect(result.searchParams.has("access_type")).toBe(false);
    expect(network).not.toHaveBeenCalled();
  });
  it.each([
    "origin",
    "path",
    "provider",
    "callback",
    "challenge",
    "method",
    "credentials",
    "fragment",
  ])("rejects an unexpected %s in the SDK target", async (part) => {
    const sdk = client();
    const target = new URL(`${backend}/auth/v1/authorize`);
    target.search = new URLSearchParams({
      provider: "google",
      redirect_to: callback,
      code_challenge: "a".repeat(43),
      code_challenge_method: "s256",
    }).toString();
    if (part === "origin") target.hostname = "untrusted.example";
    if (part === "path") target.pathname = "/external";
    if (part === "provider") target.searchParams.set("provider", "github");
    if (part === "callback") target.searchParams.set("redirect_to", "https://untrusted.example");
    if (part === "challenge") target.searchParams.delete("code_challenge");
    if (part === "method") target.searchParams.set("code_challenge_method", "plain");
    if (part === "credentials") target.username = "unexpected";
    if (part === "fragment") target.hash = "private";
    vi.spyOn(sdk.auth, "signInWithOAuth").mockResolvedValue({
      data: { provider: "google", url: target.toString() },
      error: null,
    });
    await expect(
      createSupabaseGoogleSignIn(sdk, backend, "test-key").begin(callback),
    ).rejects.toThrow();
  });
});
