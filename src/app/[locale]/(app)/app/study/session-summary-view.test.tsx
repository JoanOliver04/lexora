// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";
import en from "../../../../../../messages/en.json";
import type { SessionSummary } from "@/modules/study/application/session-summary";
import { SessionSummaryView } from "./session-summary-view";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const summary: SessionSummary = {
  reviewCount: 4,
  newItemCount: 2,
  unclassifiedCount: 0,
  ratings: { again: 1, hard: 1, good: 1, easy: 1 },
  recordedDurationMs: 30_000,
  timedReviewCount: 2,
  remaining: { availableCount: 1, hiddenDueReviews: 2, hiddenNew: 3, hasFutureReviews: true },
};
function mount(value: SessionSummary | null, locale: "es" | "en" = "es") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <SessionSummaryView summary={value} />
    </NextIntlClientProvider>,
  );
}
afterEach(() => refresh.mockClear());
describe("session summary view", () => {
  it("separates stored events, distinct new items, partial recorded time and current limits", () => {
    mount(summary);
    expect(screen.getByTestId("summary-reviews")).toHaveTextContent("4");
    expect(screen.getByTestId("summary-new-items")).toHaveTextContent("2");
    for (const rating of ["again", "hard", "good", "easy"])
      expect(screen.getByTestId(`summary-rating-${rating}`)).toHaveTextContent("1");
    expect(screen.getByTestId("summary-duration")).toHaveTextContent("30 s");
    expect(screen.getByText("Duración disponible en 2 de 4 repasos.")).toBeVisible();
    expect(screen.getByTestId("summary-hidden-reviews")).toHaveTextContent("2");
    expect(screen.getByTestId("summary-hidden-new")).toHaveTextContent("3");
    expect(screen.getByText(es.SessionSummary.future)).toBeVisible();
    expect(screen.getByText(es.SessionSummary.confirmedHint)).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("does not invent duration or availability for missing data and discloses legacy snapshots", () => {
    mount({
      ...summary,
      unclassifiedCount: 1,
      recordedDurationMs: null,
      timedReviewCount: 0,
      remaining: null,
    });
    expect(screen.getByTestId("summary-duration")).toHaveTextContent("No registrado");
    expect(screen.getByText(/1 repaso no tiene un estado previo reconocido/)).toBeVisible();
    expect(screen.getByText(es.SessionSummary.remainingUnavailable)).toBeVisible();
    expect(screen.queryByTestId("summary-available")).not.toBeInTheDocument();
    expect(screen.queryByText(/Duración disponible/)).not.toBeInTheDocument();
  });
  it("shows a confirmed empty session as zero events, not as a failed read", () => {
    mount({
      ...summary,
      reviewCount: 0,
      newItemCount: 0,
      ratings: { again: 0, hard: 0, good: 0, easy: 0 },
      recordedDurationMs: null,
      timedReviewCount: 0,
    });
    expect(screen.getByText(es.SessionSummary.empty)).toBeVisible();
    expect(screen.getByTestId("summary-reviews")).toHaveTextContent("0");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("offers an explicit read-only retry on failure without displaying fake zeroes", () => {
    mount(null);
    expect(screen.getByRole("alert")).toHaveTextContent(es.SessionSummary.unavailable);
    expect(screen.queryByTestId("summary-reviews")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar resumen" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("renders the English summary with the same distinction between history and current pending work", () => {
    mount(summary, "en");
    expect(screen.getByRole("heading", { name: "This session's summary" })).toBeVisible();
    expect(screen.getByText(en.SessionSummary.remainingHint)).toBeVisible();
    expect(screen.getByText("Duration available for 2 of 4 reviews.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Refresh summary" })).toBeEnabled();
  });
});
