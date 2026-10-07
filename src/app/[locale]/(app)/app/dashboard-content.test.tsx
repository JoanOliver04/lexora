// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import es from "../../../../../messages/es.json";
import { StudyError } from "@/modules/study/application/study-error";
import { DashboardContent } from "./dashboard-content";

const { context, dashboard } = vi.hoisted(() => ({ context: vi.fn(), dashboard: vi.fn() }));
vi.mock("@/composition/study", () => ({ getStudyContextForCurrentUser: context }));
vi.mock("@/modules/study/application/today-dashboard", () => ({ getTodayDashboard: dashboard }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#test-link">{children}</a>,
}));

const NOW = new Date("2026-10-06T10:00:00Z");
describe("Today server content", () => {
  beforeEach(() => {
    context.mockReset().mockResolvedValue({
      ownerId: "authenticated-owner",
      timeZone: "Europe/Madrid",
      clock: { now: () => NOW },
      dailyQueue: {},
      todayOverview: {},
      todayDashboard: {},
    });
    dashboard.mockReset();
  });

  it("redirects an expired session before reading the dashboard", async () => {
    context.mockResolvedValue(null);
    await expect(
      DashboardContent({ courseId: "course", locale: "es", deckQuery: undefined }),
    ).rejects.toThrow("redirect:/es/login");
    expect(dashboard).not.toHaveBeenCalled();
  });

  it("renders a recoverable failure without exposing infrastructure details", async () => {
    dashboard.mockRejectedValue(new StudyError("unavailable", "private infrastructure detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const element = await DashboardContent({
        courseId: "course",
        locale: "es",
        deckQuery: undefined,
      });
      render(
        <NextIntlClientProvider locale="es" messages={es} timeZone="Europe/Madrid" now={NOW}>
          {element}
        </NextIntlClientProvider>,
      );
      expect(screen.getByRole("alert")).toHaveTextContent("Tus datos siguen guardados.");
      expect(screen.queryByText(/private infrastructure/)).not.toBeInTheDocument();
      expect(log).toHaveBeenCalledWith("Today dashboard read failed", "unavailable");
      expect(dashboard).toHaveBeenCalledWith(
        {},
        {},
        {},
        {
          ownerId: "authenticated-owner",
          courseId: "course",
          now: NOW,
          timeZone: "Europe/Madrid",
          deckQuery: undefined,
        },
      );
    } finally {
      log.mockRestore();
    }
  });

  it("lets unexpected errors reach the route boundary", async () => {
    dashboard.mockRejectedValue(new Error("unexpected render path"));
    await expect(
      DashboardContent({ courseId: "course", locale: "es", deckQuery: undefined }),
    ).rejects.toThrow("unexpected render path");
  });
});
