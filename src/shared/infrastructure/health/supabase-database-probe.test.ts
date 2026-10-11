import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSupabaseDatabaseProbe } from "./supabase-database-probe";

vi.mock("@/env/client", () => ({
  clientEnv: {
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.test",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key",
  },
}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Supabase database health probe", () => {
  it.each([200, 206])("accepts a successful empty SELECT (%i)", async (status) => {
    fetchMock.mockResolvedValue(new Response("[]", { status }));

    expect(await createSupabaseDatabaseProbe().isReachable()).toBe(true);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      "https://database.example.test/rest/v1/languages?select=id&limit=0",
      {
        headers: { apikey: "public-test-key", Accept: "application/json" },
        signal: expect.any(AbortSignal),
        cache: "no-store",
      },
    );
  });

  it.each([401, 403, 404, 500, 503])(
    "rejects HTTP %i without hiding the failure",
    async (status) => {
      const response = new Response('{"code":"PGRST205"}', { status });
      const readBody = vi.spyOn(response, "json");
      fetchMock.mockResolvedValue(response);

      expect(await createSupabaseDatabaseProbe().isReachable()).toBe(false);
      expect(readBody).not.toHaveBeenCalled();
    },
  );

  it.each([
    { payload: null },
    { payload: {} },
    { payload: "[]" },
    { payload: [{ id: "unexpected-row" }] },
  ])("rejects a successful response that is not an empty array ($payload)", async ({ payload }) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));

    expect(await createSupabaseDatabaseProbe().isReachable()).toBe(false);
  });

  it("rejects invalid JSON instead of claiming database health", async () => {
    fetchMock.mockResolvedValue(new Response("not JSON", { status: 200 }));

    expect(await createSupabaseDatabaseProbe().isReachable()).toBe(false);
  });

  it("contains network errors without propagating internal details", async () => {
    fetchMock.mockRejectedValue(new Error("internal connection diagnostic"));

    expect(await createSupabaseDatabaseProbe().isReachable()).toBe(false);
  });

  it("aborts a stalled request and clears its timer", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );

    const pending = createSupabaseDatabaseProbe(10).isReachable();
    await vi.advanceTimersByTimeAsync(10);

    expect(await pending).toBe(false);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the timeout active while reading the response body", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async (_input, options) => {
      const response = new Response("[]", { status: 200 });
      vi.spyOn(response, "json").mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => reject(new Error("aborted body")));
          }),
      );
      return response;
    });

    const pending = createSupabaseDatabaseProbe(10).isReachable();
    await vi.advanceTimersByTimeAsync(10);

    expect(await pending).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears the timer after a successful response", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));

    expect(await createSupabaseDatabaseProbe().isReachable()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
  });
});
