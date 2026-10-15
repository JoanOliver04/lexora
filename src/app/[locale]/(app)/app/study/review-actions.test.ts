import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudyError } from "@/modules/study/application/study-error";
import { saveStudyReviewAction } from "./review-actions";

const { context, save, revalidate, redirect } = vi.hoisted(() => ({
  context: vi.fn(),
  save: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/composition/study", () => ({ getStudyContextForCurrentUser: context }));
vi.mock("@/modules/study/application/save-session-review", () => ({ saveSessionReview: save }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("next/navigation", () => ({ redirect }));
const now = new Date("2026-10-11T10:00:00Z");
const key = "60000000-0000-4000-8000-000000000001";
function form() {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    locale: "en",
    sessionId: "50000000-0000-4000-8000-000000000001",
    practiceItemId: "20000000-0000-4000-8000-000000000001",
    idempotencyKey: key,
    expectedRevision: "new",
    rating: "good",
    ownerId: "forged-owner",
    courseId: "forged-course",
    now: "2099-01-01",
    dueAt: "2099-01-01",
    stability: "999",
    configVersion: "forged",
    durationMs: "99999999",
  }))
    data.set(name, value);
  return data;
}
describe("saveStudyReviewAction", () => {
  beforeEach(() => {
    context.mockReset().mockResolvedValue({
      ownerId: "verified-owner",
      timeZone: "Europe/Madrid",
      clock: { now: () => now },
      sessions: {},
      dailyQueue: {},
      cards: {},
      learningStates: {},
      scheduler: {},
      reviewCommitter: {},
    });
    save.mockReset().mockResolvedValue({ ok: true, rating: "good", replayed: false });
    revalidate.mockReset();
    redirect.mockClear();
  });
  it("uses verified identity, clock and configuration; ignores forged state, metadata and previous success", async () => {
    expect(
      await saveStudyReviewAction({ receipt: { rating: "easy", replayed: true } }, form()),
    ).toEqual({
      receipt: { rating: "good", replayed: false },
      requestId: key,
    });
    expect(save).toHaveBeenCalledExactlyOnceWith(
      { sessions: {}, queue: {}, cards: {}, memory: {}, scheduler: {}, committer: {} },
      {
        ownerId: "verified-owner",
        timeZone: "Europe/Madrid",
        now,
        sessionId: "50000000-0000-4000-8000-000000000001",
        practiceItemId: "20000000-0000-4000-8000-000000000001",
        idempotencyKey: key,
        expectedRevision: null,
        rating: "good",
        config: expect.objectContaining({ configVersion: "v1", enableFuzz: true }),
      },
    );
    expect(revalidate.mock.calls).toEqual([
      ["/en/app"],
      ["/en/app/study/50000000-0000-4000-8000-000000000001"],
    ]);
  });
  it("redirects expired identity safely before any mutation", async () => {
    context.mockResolvedValue(null);
    const data = form();
    data.set("locale", "//evil.invalid");
    await expect(saveStudyReviewAction({}, data)).rejects.toThrow("redirect:/es/login");
    expect(save).not.toHaveBeenCalled();
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("uses a safe fallback locale and accepts a positive observed revision", async () => {
    const data = form();
    data.set("locale", "//evil.invalid");
    data.set("expectedRevision", "7");
    await saveStudyReviewAction({}, data);
    expect(save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expectedRevision: 7 }),
    );
    expect(revalidate).toHaveBeenCalledWith("/es/app");
  });
  it.each(["", "0", "-1", "1.5", "01", " 1", "Infinity", "bad"])(
    "does not coerce malformed revision %j into a valid one",
    async (revision) => {
      const data = form();
      data.set("expectedRevision", revision);
      save.mockResolvedValue({ ok: false, reason: "invalid-input" });
      expect(await saveStudyReviewAction({}, data)).toEqual({
        error: "invalid-input",
        requestId: key,
      });
      expect(save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ expectedRevision: undefined }),
      );
      expect(revalidate).not.toHaveBeenCalled();
    },
  );
  it.each([
    "invalid-input",
    "not-found",
    "inactive-session",
    "invalid-timezone",
    "card-changed",
    "idempotency-conflict",
    "revision-conflict",
    "scheduler-mismatch",
  ])("does not revalidate or announce success after %s", async (reason) => {
    save.mockResolvedValue({ ok: false, reason });
    expect(await saveStudyReviewAction({}, form())).toEqual({ error: reason, requestId: key });
    expect(revalidate).not.toHaveBeenCalled();
  });
  it("returns a confirmed replay receipt", async () => {
    save.mockResolvedValue({ ok: true, rating: "good", replayed: true });
    expect(await saveStudyReviewAction({}, form())).toEqual({
      receipt: { rating: "good", replayed: true },
      requestId: key,
    });
  });
  it("reports infrastructure failures without logging private content or claiming a save", async () => {
    save.mockRejectedValue(new StudyError("unavailable", "PRIVATE_CONTENT_AND_TOKEN"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await saveStudyReviewAction({}, form())).toEqual({ error: "generic", requestId: key });
      expect(log).toHaveBeenCalledExactlyOnceWith("Study review save failed", "unavailable");
      expect(revalidate).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it("does not silence unexpected programming errors", async () => {
    save.mockRejectedValue(new Error("unexpected"));
    await expect(saveStudyReviewAction({}, form())).rejects.toThrow("unexpected");
  });
  it("preserves the retry key when context loading fails before the commit", async () => {
    context.mockRejectedValue(new StudyError("unavailable", "PRIVATE_PROFILE_ERROR"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await saveStudyReviewAction({}, form())).toEqual({ error: "generic", requestId: key });
      expect(save).not.toHaveBeenCalled();
      expect(revalidate).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledExactlyOnceWith("Study review save failed", "unavailable");
    } finally {
      log.mockRestore();
    }
  });
});
