import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
vi.mock("@/env/deployment", () => ({ privateBackendEnabled: () => true }));
const mocks = vi.hoisted(() => ({
  claims: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));
vi.mock("@/env/client", () => ({
  clientEnv: {
    NEXT_PUBLIC_SITE_URL: "https://lexora.example",
    NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test",
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getClaims: mocks.claims }, from: mocks.from }),
}));
import { refreshSupabaseSession } from "./session";
describe("Unprefixed private entry locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claims.mockResolvedValue({ data: { claims: { sub: "signed-owner" } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.single });
    mocks.single.mockResolvedValue({ data: { ui_locale: "en" }, error: null });
  });
  it("reads only the signed owner's locale at /app, never a query subject", async () => {
    const result = await refreshSupabaseSession(
      new NextRequest("https://lexora.example/app?owner=foreign"),
      NextResponse.next(),
    );
    expect(result.entryLocale).toBe("en");
    expect(mocks.select).toHaveBeenCalledWith("ui_locale");
    expect(mocks.eq).toHaveBeenCalledWith("id", "signed-owner");
  });
  it("does not query preferences for explicit locale URLs or other public paths", async () => {
    for (const path of ["/es/app", "/en/app", "/es/login", "/app/settings"]) {
      expect(
        (
          await refreshSupabaseSession(
            new NextRequest(`https://lexora.example${path}`),
            NextResponse.next(),
          )
        ).entryLocale,
      ).toBeNull();
    }
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("never reads preferences without a valid identity", async () => {
    mocks.claims.mockResolvedValue({
      data: { claims: { sub: "unverified" } },
      error: new Error("Invalid signature"),
    });
    const result = await refreshSupabaseSession(
      new NextRequest("https://lexora.example/app"),
      NextResponse.next(),
    );
    expect(result.userId).toBeNull();
    expect(result.entryLocale).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("falls back to existing routing for a missing or invalid locale", async () => {
    for (const profile of [null, { ui_locale: "https://foreign.example" }, { ui_locale: "" }]) {
      mocks.single.mockResolvedValue({ data: profile, error: null });
      expect(
        (
          await refreshSupabaseSession(
            new NextRequest("https://lexora.example/app"),
            NextResponse.next(),
          )
        ).entryLocale,
      ).toBeNull();
    }
  });
});
