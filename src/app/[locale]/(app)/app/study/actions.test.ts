import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudyError } from "@/modules/study/application/study-error";
import { createStudySessionAction } from "./actions";

const { context, course, create, revalidate, redirect } = vi.hoisted(() => ({
  context: vi.fn(),
  course: vi.fn(),
  create: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock("@/composition/study", () => ({ getStudyContextForCurrentUser: context }));
vi.mock("@/composition/courses", () => ({ getActiveCourseForCurrentUser: course }));
vi.mock("@/modules/study/application/study-session", () => ({ createStudySession: create }));
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
vi.mock("next/navigation", () => ({ redirect }));

const NOW = new Date("2026-10-06T10:00:00Z");
const SESSION = "50000000-0000-4000-8000-000000000001";
const DECK = "d0000000-0000-4000-8000-000000000001";
function form(): FormData {
  const data = new FormData();
  data.set("locale", "en");
  data.set("scopeMode", "selected");
  data.set("deckIds", DECK);
  data.set("sessionId", SESSION);
  data.set("ownerId", "forged");
  data.set("courseId", "forged-course");
  data.set("now", "2099-01-01T00:00:00Z");
  return data;
}
describe("study session action", () => {
  beforeEach(() => {
    context.mockReset().mockResolvedValue({
      ownerId: "verified-owner",
      timeZone: "Europe/Madrid",
      clock: { now: () => NOW },
      sessions: {},
      dailyQueue: {},
      todayDashboard: {},
    });
    course.mockReset().mockResolvedValue({ id: "active-course" });
    create.mockReset().mockResolvedValue({ ok: true, session: { id: SESSION }, replayed: false });
    revalidate.mockClear();
    redirect.mockClear();
  });
  it("derives identity, active course and time on the server, then redirects after confirmation", async () => {
    await expect(createStudySessionAction({}, form())).rejects.toThrow(
      `redirect:/en/app/study/${SESSION}`,
    );
    expect(create).toHaveBeenCalledWith(
      {},
      {},
      {},
      {
        ownerId: "verified-owner",
        courseId: "active-course",
        now: NOW,
        timeZone: "Europe/Madrid",
        sessionId: SESSION,
        mode: "selected",
        deckIds: [DECK],
      },
    );
    expect(revalidate).toHaveBeenCalledWith("/en/app");
    expect(revalidate).toHaveBeenCalledWith("/en/app/study");
  });
  it("redirects an expired session and validates a locale used in URLs", async () => {
    context.mockResolvedValue(null);
    const data = form();
    data.set("locale", "//external.invalid");
    await expect(createStudySessionAction({}, data)).rejects.toThrow("redirect:/es/login");
    expect(create).not.toHaveBeenCalled();
  });
  it("requires an active course before creating a session", async () => {
    course.mockResolvedValue(null);
    await expect(createStudySessionAction({}, form())).rejects.toThrow("redirect:/en/onboarding");
    expect(create).not.toHaveBeenCalled();
  });
  it("returns a translated error key without navigating on validation failure", async () => {
    create.mockResolvedValue({ ok: false, reason: "invalid-scope" });
    expect(await createStudySessionAction({}, form())).toEqual({ error: "invalid-scope" });
    expect(revalidate).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("allows a failed write to be retried without exposing infrastructure details", async () => {
    create.mockRejectedValue(new StudyError("unavailable", "private write detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await createStudySessionAction({}, form())).toEqual({ error: "generic" });
      expect(log).toHaveBeenCalledWith("Study session creation failed", "unavailable");
    } finally {
      log.mockRestore();
    }
    expect(redirect).not.toHaveBeenCalled();
  });
  it("does not silence an unexpected programming failure", async () => {
    create.mockRejectedValue(new Error("unexpected"));
    await expect(createStudySessionAction({}, form())).rejects.toThrow("unexpected");
  });
});
