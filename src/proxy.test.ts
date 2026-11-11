import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const { intl, refresh } = vi.hoisted(() => ({ intl: vi.fn(), refresh: vi.fn() }));
vi.mock("next-intl/middleware", () => ({ default: () => intl }));
vi.mock("./shared/infrastructure/supabase/session", () => ({ refreshSupabaseSession: refresh }));
vi.mock("./env/client", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SITE_URL: "https://lexora.example",
  },
}));
vi.mock("./env/server", () => ({ serverEnv: { NODE_ENV: "production" } }));
import proxy from "./proxy";
import { config } from "./proxy";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
describe("Private entry redirects", () => {
  beforeEach(() => {
    intl.mockReturnValue(NextResponse.next());
    refresh.mockImplementation(async (_request: NextRequest, response: NextResponse) => {
      response.cookies.set("fixture-session", "renewed");
      return { response, userId: "owner", entryLocale: "en" };
    });
  });
  it("overwrites caller nonce/CSP and retains the new policy on private redirects", async () => {
    const request = new NextRequest("https://lexora.example/app", {
      headers: { "x-nonce": "attacker", "Content-Security-Policy": "script-src *" },
    });
    const response = await proxy(request);
    const nonce = request.headers.get("x-nonce");
    expect(nonce).toMatch(/^[A-Za-z0-9+/]{32}$/);
    expect(response.headers.get("content-security-policy")).toContain(`'nonce-${nonce}'`);
    expect(request.headers.get("content-security-policy")).toBe(
      response.headers.get("content-security-policy"),
    );
    const second = await proxy(new NextRequest("https://lexora.example/en"));
    expect(second.headers.get("content-security-policy")).not.toBe(
      response.headers.get("content-security-policy"),
    );
    expect(second.headers.get("cache-control")).toBe("private, no-store");
  });
  it("matches actual HTML routes including dots and excludes only static/API namespaces", () => {
    for (const url of [
      "/en",
      "/es/app",
      "/en/concepts/word.with.dot",
      "/en/unknown.txt",
      "/apiary",
    ])
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
    for (const url of [
      "/api/health",
      "/_next/static/chunk.js",
      "/icons/lexora.svg",
      "/sw.js",
      "/sw.js?revision=2",
      "/offline.html",
      "/manifest.webmanifest",
      "/favicon.ico",
    ])
      expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
  it("launches Today with the saved locale and retains filters, cookies and private cache headers", async () => {
    const response = await proxy(new NextRequest("https://lexora.example/app?deck=original"));
    expect(response.headers.get("location")).toBe("https://lexora.example/en/app?deck=original");
    expect(response.cookies.get("fixture-session")?.value).toBe("renewed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("keeps an explicit locale URL authoritative", async () => {
    const response = await proxy(new NextRequest("https://lexora.example/es/app"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("preserves the anonymous login gate and a safe same-origin return destination", async () => {
    const response = NextResponse.next();
    response.cookies.set("fixture-session", "cleared");
    refresh.mockResolvedValue({ response, userId: null, entryLocale: null });
    const result = await proxy(
      new NextRequest("https://lexora.example/en/app?next=https://foreign.example"),
    );
    const location = new URL(result.headers.get("location")!);
    expect(location.origin).toBe("https://lexora.example");
    expect(location.pathname).toBe("/en/login");
    expect(location.searchParams.get("next")).toBe("/en");
    expect(result.cookies.get("fixture-session")?.value).toBe("cleared");
  });
});
