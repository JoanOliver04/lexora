import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudyError } from "@/modules/study/application/study-error";
import { changeStudySessionAction } from "./session-actions";

const { context, change, revalidate } = vi.hoisted(() => ({
  context: vi.fn(),
  change: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/composition/study", () => ({ getStudyContextForCurrentUser: context }));
vi.mock("@/modules/study/application/study-session", () => ({ changeStudySession: change }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
const now = new Date("2026-10-16T10:00:00Z");
const id = "50000000-0000-4000-8000-000000000001";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    locale: "en",
    sessionId: id,
    action: "pause",
    expectedStatus: "active",
    ownerId: "forged",
    now: "2099-01-01",
  }))
    data.set(key, value);
  return data;
}
describe("session lifecycle action", () => {
  beforeEach(() => {
    context.mockReset().mockResolvedValue({
      ownerId: "verified",
      clock: { now: () => now },
      timeZone: "Europe/Madrid",
      sessions: {},
      dailyQueue: {},
    });
    change.mockReset().mockResolvedValue({ ok: true, session: { id } });
    revalidate.mockClear();
  });
  it("uses only server identity/time and refreshes affected paths after confirmation", async () => {
    expect(await changeStudySessionAction({}, form())).toEqual({});
    expect(change).toHaveBeenCalledExactlyOnceWith(
      {},
      {},
      {
        ownerId: "verified",
        now,
        timeZone: "Europe/Madrid",
        sessionId: id,
        action: "pause",
        expectedStatus: "active",
      },
    );
    expect(revalidate.mock.calls.map(([path]) => path)).toEqual([
      "/en/app",
      "/en/app/study",
      `/en/app/study/${id}`,
    ]);
  });
  it("returns an expired-access error without mutating or redirecting an uncertain review", async () => {
    context.mockResolvedValue(null);
    expect(await changeStudySessionAction({}, form())).toEqual({ error: "unauthenticated" });
    expect(change).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("does not interpolate an untrusted locale into paths", async () => {
    const data = form();
    data.set("locale", "//external.invalid");
    await changeStudySessionAction({}, data);
    expect(revalidate).toHaveBeenCalledWith(`/es/app/study/${id}`);
  });
  it("does not revalidate failed transitions", async () => {
    change.mockResolvedValue({ ok: false, reason: "session-changed" });
    expect(await changeStudySessionAction({}, form())).toEqual({ error: "session-changed" });
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("returns no private storage error details", async () => {
    change.mockRejectedValue(new StudyError("unavailable", "private details"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await changeStudySessionAction({}, form())).toEqual({ error: "generic" });
      expect(log).toHaveBeenCalledWith("Study session transition failed", "unavailable");
    } finally {
      log.mockRestore();
    }
  });
  it("does not hide programming errors on the server", async () => {
    change.mockRejectedValue(new Error("unexpected"));
    await expect(changeStudySessionAction({}, form())).rejects.toThrow("unexpected");
  });
});
