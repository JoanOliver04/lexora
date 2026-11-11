// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionSummary } from "@/modules/study/application/session-summary";
import { StudyError } from "@/modules/study/application/study-error";
import Page from "./page";

const { context, card, summary, onboarding } = vi.hoisted(() => ({
  context: vi.fn(),
  card: vi.fn(),
  summary: vi.fn(),
  onboarding: vi.fn(),
}));
vi.mock("@/composition/study", () => ({ getStudyContextForCurrentUser: context }));
vi.mock("@/composition/preferences", () => ({
  getIntervalPreviewForCurrentUser: async () => true,
}));
vi.mock("@/composition/onboarding", () => ({ hasCompletedOnboardingForCurrentUser: onboarding }));
vi.mock("@/modules/study/application/study-card", () => ({ getStudySessionCard: card }));
vi.mock("@/modules/study/application/session-summary", () => ({ getStudySessionSummary: summary }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string, values?: { date?: string }) => values?.date ?? key,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: React.ComponentProps<"a">) => <a href={href}>{children}</a>,
}));
vi.mock("../study-card-view", () => ({ StudyCardView: () => null }));
vi.mock("../session-summary-view", () => ({
  SessionSummaryView: ({ summary }: { summary: SessionSummary | null }) => (
    <p data-testid="summary-panel">{summary === null ? "failed" : summary.reviewCount}</p>
  ),
}));
const now = new Date("2026-10-16T10:00:00Z");
const id = "50000000-0000-4000-8000-000000000001";
const result = {
  ok: true,
  session: {
    id,
    ownerId: "owner",
    courseId: "course",
    scope: { deckIds: null },
    status: "paused",
    startedAt: now,
    endedAt: null,
  },
  queue: null,
  card: null,
};
describe("session summary route", () => {
  beforeEach(() => {
    onboarding.mockReset().mockResolvedValue(true);
    context.mockReset().mockResolvedValue({
      ownerId: "owner",
      clock: { now: () => now },
      timeZone: "Mars/Olympus",
      sessions: {},
      sessionHistory: {},
      dailyQueue: {},
      cards: {},
    });
    card.mockReset().mockResolvedValue(result);
    summary
      .mockReset()
      .mockResolvedValue({ ok: true, summary: { reviewCount: 1, remaining: null } });
  });
  it("preserves accessible history when an incompatible time zone makes current pending items unavailable", async () => {
    render(await Page({ params: Promise.resolve({ locale: "es", sessionId: id }) }));
    expect(screen.getByText(now.toISOString())).toBeVisible();
    expect(screen.getByTestId("summary-panel")).toHaveTextContent("1");
    expect(summary).toHaveBeenCalledWith(
      {},
      {},
      {},
      { ownerId: "owner", sessionId: id, now, timeZone: "Mars/Olympus" },
    );
  });
  it("returns a recoverable panel for storage failures, without a fake empty summary", async () => {
    summary.mockRejectedValue(new StudyError("unavailable", "private detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      render(await Page({ params: Promise.resolve({ locale: "es", sessionId: id }) }));
      expect(screen.getByTestId("summary-panel")).toHaveTextContent("failed");
      expect(log).toHaveBeenCalledWith("Study session summary failed", "unavailable");
    } finally {
      log.mockRestore();
    }
  });
  it("does not mask programming failures", async () => {
    summary.mockRejectedValue(new Error("unexpected"));
    await expect(
      Page({ params: Promise.resolve({ locale: "es", sessionId: id }) }),
    ).rejects.toThrow("unexpected");
  });
  it("does not load or display a summary while the session is active", async () => {
    card.mockResolvedValue({ ...result, session: { ...result.session, status: "active" } });
    render(await Page({ params: Promise.resolve({ locale: "es", sessionId: id }) }));
    expect(summary).not.toHaveBeenCalled();
    expect(screen.queryByTestId("summary-panel")).not.toBeInTheDocument();
  });
  it("keeps unknown and foreign sessions behind not-found before summary reads", async () => {
    card.mockResolvedValue({ ok: false, reason: "not-found" });
    await expect(
      Page({ params: Promise.resolve({ locale: "es", sessionId: id }) }),
    ).rejects.toThrow("not-found");
    expect(summary).not.toHaveBeenCalled();
  });
});
