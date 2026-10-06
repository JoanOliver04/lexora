// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import es from "../../../../../messages/es.json";
import en from "../../../../../messages/en.json";
import type { TodayDashboard } from "@/modules/study/application/today-dashboard";
import { recentStudyDays } from "@/modules/study/domain/study-activity";
import { DashboardView } from "./dashboard-view";
import { DashboardError } from "./dashboard-error";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: unknown;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href="#test-link" data-href={JSON.stringify(href)} className={className}>
      {children}
    </a>
  ),
}));

const NOW = new Date("2026-10-06T10:00:00Z");
function model(): TodayDashboard {
  const days = recentStudyDays(NOW, "Europe/Madrid").map((day, index) => ({
    ...day,
    reviews: index === 6 ? 2 : 0,
    newIntroduced: index === 6 ? 1 : 0,
    durationMs: 0,
    measuredReviews: 0,
  }));
  return {
    overview: {
      dueReviews: 3,
      availableReviews: 1,
      learningDue: 1,
      newAvailable: 1,
      difficultItems: 2,
      availableCount: 3,
      hiddenDueReviews: 2,
      hiddenNew: 1,
      nextDueAt: null,
      estimate: { source: "fallback", sampleSize: 0, perReviewMs: 30_000, totalMs: 90_000 },
    },
    scope: { deckIds: null },
    scopeDeckNames: [],
    lastScope: null,
    lastScopeAvailable: false,
    status: "ready",
    days,
    today: days[6]!,
    week: { reviews: 2, newIntroduced: 1, durationMs: 0, measuredReviews: 0 },
  };
}
function provider(children: React.ReactNode, locale: "es" | "en" = "es") {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
      timeZone="Europe/Madrid"
      now={NOW}
    >
      {children}
    </NextIntlClientProvider>
  );
}

describe("Today presentation", () => {
  it("makes available work and hidden backlog distinct, with an honest estimate", () => {
    render(provider(<DashboardView dashboard={model()} timeZone="Europe/Madrid" />));
    expect(screen.getByTestId("today-available")).toHaveTextContent("3");
    expect(screen.getByTestId("today-dueReviews")).toHaveTextContent("3");
    expect(screen.getByText("2 repasos siguen vencidos, fuera del límite diario.")).toBeVisible();
    expect(screen.getByText("1 ítem nuevo queda fuera del cupo de hoy.")).toBeVisible();
    expect(screen.getByText("≈ 2 min")).toBeVisible();
    expect(screen.getByText(/Estimación inicial/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Empezar sesión" })).toHaveAttribute(
      "data-href",
      JSON.stringify("/app/study"),
    );
    expect(screen.queryByText(/\d\s*%/)).not.toBeInTheDocument();
  });

  it("renders complete English labels, seven calendar days and recorded-time caveats", () => {
    render(provider(<DashboardView dashboard={model()} timeZone="Europe/Madrid" />, "en"));
    expect(screen.getByRole("heading", { name: "Your next step starts here" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Last seven days" }).children).toHaveLength(7);
    expect(screen.getByTestId("week-reviews")).toHaveTextContent("2");
    expect(screen.getByText(/Some reviews have no recorded duration/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Start session" })).toBeVisible();
  });

  it("offers import for an empty scope without claiming work was completed", () => {
    const dashboard = model();
    dashboard.status = "empty";
    dashboard.overview = {
      ...dashboard.overview,
      availableCount: 0,
      dueReviews: 0,
      hiddenDueReviews: 0,
      hiddenNew: 0,
    };
    render(provider(<DashboardView dashboard={dashboard} timeZone="Europe/Madrid" />));
    expect(screen.getByRole("heading", { name: "Prepara tu primer repaso" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Importar vocabulario" })).toHaveAttribute(
      "data-href",
      JSON.stringify("/import"),
    );
    expect(screen.queryByText(/has terminado/i)).not.toBeInTheDocument();
  });

  it("announces limits instead of showing the empty-library prompt", () => {
    const dashboard = model();
    dashboard.status = "limited";
    dashboard.overview.availableCount = 0;
    render(provider(<DashboardView dashboard={dashboard} timeZone="Europe/Madrid" />));
    expect(screen.getByRole("heading", { name: "Has alcanzado los límites de hoy" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Importar vocabulario" })).not.toBeInTheDocument();
  });

  it("shows the next due time in the profile timezone for waiting items", () => {
    const dashboard = model();
    dashboard.status = "waiting";
    dashboard.overview.nextDueAt = new Date("2026-10-06T23:30:00Z");
    render(provider(<DashboardView dashboard={dashboard} timeZone="Europe/Madrid" />));
    expect(screen.getByRole("heading", { name: "Ahora no hay ítems vencidos" })).toBeVisible();
    expect(screen.getByText(/7 oct 2026.*1:30/)).toBeVisible();
  });

  it("passes the last saved scope to navigation", () => {
    const dashboard = model();
    dashboard.lastScope = { deckIds: ["d0000000-0000-4000-8000-000000000001"] };
    dashboard.lastScopeAvailable = true;
    render(provider(<DashboardView dashboard={dashboard} timeZone="Europe/Madrid" />));
    expect(screen.getByRole("link", { name: "Volver al último filtro" })).toHaveAttribute(
      "data-href",
      JSON.stringify({ pathname: "/app", query: { deck: dashboard.lastScope.deckIds } }),
    );
  });

  it("provides a retry for read failures", async () => {
    render(provider(<DashboardError />));
    await userEvent.click(screen.getByRole("button", { name: "Volver a intentar" }));
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Tus datos siguen guardados.");
  });

  it("uses the current Next.js error-boundary retry callback", async () => {
    const retry = vi.fn();
    render(provider(<DashboardError retry={retry} />));
    await userEvent.click(screen.getByRole("button", { name: "Volver a intentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("allows an invalid filter to be cleared rather than repeatedly retried", () => {
    render(provider(<DashboardError invalidFilter />));
    expect(screen.getByRole("alert")).toHaveTextContent("No se puede aplicar ese filtro.");
    expect(screen.getByRole("link", { name: "Ver todos los mazos" })).toHaveAttribute(
      "data-href",
      JSON.stringify("/app"),
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
