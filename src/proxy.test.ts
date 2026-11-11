import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
const { intl, refresh } = vi.hoisted(() => ({ intl: vi.fn(), refresh: vi.fn() }));
vi.mock("next-intl/middleware", () => ({ default: () => intl }));
vi.mock("./shared/infrastructure/supabase/session", () => ({ refreshSupabaseSession: refresh }));
import proxy from "./proxy";
describe("Private entry redirects", () => {
  beforeEach(() => {
    intl.mockReturnValue(NextResponse.next());
    refresh.mockImplementation(async (_request: NextRequest, response: NextResponse) => {
      response.cookies.set("fixture-session", "renewed");
      return { response, userId: "owner", entryLocale: "en" };
    });
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
