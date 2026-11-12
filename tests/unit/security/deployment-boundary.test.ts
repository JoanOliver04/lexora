import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
vi.mock("server-only", () => ({}));
vi.mock("@/env/client", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SITE_URL: "https://lexora.example",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-synthetic",
  },
}));
const mocks = vi.hoisted(() => ({
  env: {
    NODE_ENV: "production",
    VERCEL: "1",
    VERCEL_ENV: "preview",
    LEXORA_ALLOW_REGISTRATION: "true",
  } as Record<string, string | undefined>,
  client: vi.fn(),
  cookies: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@/env/server", () => ({ serverEnv: mocks.env }));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.client }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
import { privateBackendEnabled, PreviewAccessError } from "@/env/deployment";
import { createSupabaseServerClient } from "@/shared/infrastructure/supabase/server-client";
import { refreshSupabaseSession } from "@/shared/infrastructure/supabase/session";
import { createSupabaseDatabaseProbe } from "@/shared/infrastructure/health/supabase-database-probe";
import { POST as exportRequest } from "@/app/api/account/export/route";
import { POST as deleteRequest } from "@/app/api/account/delete/route";
import { POST as reviewRequest } from "@/app/api/study/reviews/route";
import { POST as importRequest } from "@/app/api/import/jobs/route";
import {
  completeAuthCallback,
  ensureProfileForCurrentUser,
  getCurrentUserId,
  isRegistrationOpen,
  isGoogleSignInAvailable,
  registerVisitor,
  requestPasswordResetFor,
  signInVisitor,
  signInGoogleVisitor,
  signOutVisitor,
  updateCurrentPassword,
} from "@/composition/identity";

describe("Deployment boundary before any private backend access", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env["VERCEL"] = "1";
    mocks.env["VERCEL_ENV"] = "preview";
    vi.stubGlobal("fetch", mocks.fetch);
  });
  it("rejects even a direct factory call before reading cookies or creating a network client", async () => {
    await expect(createSupabaseServerClient()).rejects.toBeInstanceOf(PreviewAccessError);
    expect(mocks.cookies).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });
  it("denies every private HTTP mutation before reading a body or creating a backend client", async () => {
    for (const handler of [exportRequest, deleteRequest, reviewRequest, importRequest]) {
      const result = await handler(
        new Request("https://preview.example/api/private", { method: "POST", body: "untrusted" }),
      );
      expect(result.status).toBe(403);
      expect(result.headers.get("cache-control")).toContain("no-store");
    }
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("denies session refresh, health and every Auth entry before network access, even with registration override", async () => {
    mocks.env["LEXORA_GOOGLE_AUTH"] = "enabled";
    expect(await isGoogleSignInAvailable()).toBe(false);
    expect(await signInGoogleVisitor("https://lexora.example/api/auth/callback")).toEqual({
      ok: false,
      error: "preview-disabled",
    });
    expect(await getCurrentUserId()).toBeNull();
    expect(await ensureProfileForCurrentUser()).toBeNull();
    const credentials = { email: "synthetic@example.com", password: "synthetic-password" };
    expect(await signInVisitor(credentials)).toEqual({ ok: false, error: "preview-disabled" });
    expect(await requestPasswordResetFor(credentials, "https://lexora.example")).toEqual({
      ok: false,
      error: "preview-disabled",
    });
    expect(await updateCurrentPassword(credentials)).toEqual({
      ok: false,
      error: "preview-disabled",
    });
    expect(await registerVisitor(credentials, "https://lexora.example")).toEqual({
      ok: false,
      error: "registration-closed",
    });
    expect(isRegistrationOpen()).toBe(false);
    expect(await completeAuthCallback("untrusted-code")).toBe(false);
    await signOutVisitor();
    expect(
      (
        await refreshSupabaseSession(
          new NextRequest("https://preview.example/app"),
          NextResponse.next(),
        )
      ).userId,
    ).toBeNull();
    expect(await createSupabaseDatabaseProbe().isReachable()).toBe(false);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.cookies).not.toHaveBeenCalled();
  });
  it("fails closed on Vercel with unknown environment and keeps local/production enabled", () => {
    mocks.env["VERCEL_ENV"] = undefined;
    expect(privateBackendEnabled()).toBe(false);
    mocks.env["VERCEL"] = undefined;
    expect(privateBackendEnabled()).toBe(true);
    mocks.env["VERCEL"] = "1";
    mocks.env["VERCEL_ENV"] = "production";
    expect(privateBackendEnabled()).toBe(true);
    mocks.env["VERCEL_ENV"] = "development";
    expect(privateBackendEnabled()).toBe(true);
  });
  it("propagates cancellation to the SDK fetch while preserving an individual request signal", async () => {
    mocks.env["VERCEL_ENV"] = "production";
    mocks.cookies.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    mocks.fetch.mockResolvedValue(new Response("synthetic"));
    const budget = new AbortController(),
      individual = new AbortController();
    await createSupabaseServerClient(budget.signal);
    const options = mocks.client.mock.calls[0]?.[2] as { global?: { fetch: typeof fetch } };
    if (!options.global) throw new Error("Scoped transport missing");
    await options.global.fetch("https://project.supabase.co/rest/v1/profiles", {
      signal: individual.signal,
    });
    const init = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal?.aborted).toBe(false);
    individual.abort();
    expect(init.signal?.aborted).toBe(true);
    const request = new Request("https://project.supabase.co/auth/v1/user");
    await options.global.fetch(request);
    const authInit = mocks.fetch.mock.calls[1]?.[1] as RequestInit;
    budget.abort();
    expect(authInit.signal?.aborted).toBe(true);
  });
});
