import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isReachable } = vi.hoisted(() => ({ isReachable: vi.fn<() => Promise<boolean>>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/shared/infrastructure/health/supabase-database-probe", () => ({
  createSupabaseDatabaseProbe: () => ({ isReachable }),
}));

describe("public health probe budget", () => {
  beforeEach(() => {
    vi.resetModules();
    isReachable.mockReset();
  });

  afterEach(() => vi.restoreAllMocks());

  it("shares a pending check and refreshes it after the window even if the result is degraded", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    let finish = (_value: boolean) => {};
    isReachable.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    const { getHealthReport } = await import("./health");
    const first = getHealthReport();
    const second = getHealthReport();
    expect(isReachable).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(3000);
    finish(false);
    const results = await Promise.all([first, second]);
    expect(results.map((report) => report.status)).toEqual(["degraded", "degraded"]);

    clock.mockReturnValue(12_999);
    expect((await getHealthReport()).status).toBe("degraded");
    expect(isReachable).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(13_000);
    isReachable.mockResolvedValueOnce(true);
    expect((await getHealthReport()).status).toBe("ok");
    expect(isReachable).toHaveBeenCalledTimes(2);
  });
});
