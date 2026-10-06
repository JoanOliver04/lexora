import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudyError } from "@/modules/study/application/study-error";
import { revealStudyCardAction } from "./reveal-actions";

const { context, reveal, preview, redirect } = vi.hoisted(() => ({
  context: vi.fn(),
  reveal: vi.fn(),
  preview: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/composition/study", () => ({ getStudyContextForCurrentUser: context }));
vi.mock("@/modules/study/application/study-card", () => ({ revealStudySessionCard: reveal }));
vi.mock("@/modules/study/application/rating-interval-preview", () => ({
  getRatingIntervalPreview: preview,
}));
vi.mock("next/navigation", () => ({ redirect }));
const now = new Date("2026-10-06T10:00:00Z");
function form() {
  const data = new FormData();
  for (const [name, value] of Object.entries({
    locale: "en",
    sessionId: "session",
    practiceItemId: "item",
    ownerId: "forged-owner",
    courseId: "forged-course",
    now: "2099-01-01",
    rating: "easy",
  }))
    data.set(name, value);
  return data;
}
describe("read-only reveal action", () => {
  beforeEach(() => {
    context.mockReset().mockResolvedValue({
      ownerId: "verified",
      timeZone: "Europe/Madrid",
      clock: { now: () => now },
      sessions: {},
      dailyQueue: {},
      cards: {},
      learningStates: {},
      scheduler: {},
    });
    reveal
      .mockReset()
      .mockResolvedValue({ ok: true, practiceItemId: "item", content: { answerText: "answer" } });
    preview.mockReset().mockResolvedValue({ ok: true, preview: { intervals: [] } });
    redirect.mockClear();
  });
  it("uses only verified owner/time and the requested session/item, ignoring forged fields and previous content", async () => {
    expect(
      await revealStudyCardAction(
        {
          content: {
            mode: "cloze",
            promptText: "forged",
            hintText: null,
            answerText: "forged answer",
            clozeAnswers: ["forged"],
            exampleText: null,
            explanationText: null,
          },
        },
        form(),
      ),
    ).toEqual({
      content: { answerText: "answer" },
      preview: { intervals: [] },
    });
    expect(reveal).toHaveBeenCalledExactlyOnceWith(
      {},
      {},
      {},
      {
        ownerId: "verified",
        sessionId: "session",
        practiceItemId: "item",
        now,
        timeZone: "Europe/Madrid",
      },
    );
    expect(redirect).not.toHaveBeenCalled();
    expect(preview).toHaveBeenCalledWith(
      {},
      {},
      expect.objectContaining({
        ownerId: "verified",
        practiceItemId: "item",
        now,
        config: expect.objectContaining({ configVersion: "v1", enableFuzz: true }),
      }),
    );
  });
  it("redirects expired identity with a safe locale before reading answers", async () => {
    context.mockResolvedValue(null);
    const data = form();
    data.set("locale", "//evil.invalid");
    await expect(revealStudyCardAction({}, data)).rejects.toThrow("redirect:/es/login");
    expect(reveal).not.toHaveBeenCalled();
  });
  it.each(["not-found", "invalid-timezone", "card-changed"])(
    "returns %s without content",
    async (reason) => {
      reveal.mockResolvedValue({ ok: false, reason });
      expect(await revealStudyCardAction({}, form())).toEqual({ error: reason });
      expect(preview).not.toHaveBeenCalled();
    },
  );
  it("returns a recoverable infrastructure error without logging content", async () => {
    reveal.mockRejectedValue(new StudyError("unavailable", "PRIVATE_ANSWER"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await revealStudyCardAction({}, form())).toEqual({ error: "generic" });
      expect(log).toHaveBeenCalledExactlyOnceWith("Study card reveal failed", "unavailable");
    } finally {
      log.mockRestore();
    }
  });
  it("does not silence unexpected errors", async () => {
    reveal.mockRejectedValue(new Error("unexpected"));
    await expect(revealStudyCardAction({}, form())).rejects.toThrow("unexpected");
  });
  it("reveals content but does not promise an interval on incompatible memory", async () => {
    preview.mockResolvedValue({ ok: false, reason: "scheduler-mismatch" });
    expect(await revealStudyCardAction({}, form())).toEqual({
      content: { answerText: "answer" },
      previewUnavailable: true,
    });
  });
});
