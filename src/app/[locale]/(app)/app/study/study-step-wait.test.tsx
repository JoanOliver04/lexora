// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";
import en from "../../../../../../messages/en.json";
import { StudyStepWait } from "./study-step-wait";

const { refresh, check } = vi.hoisted(() => ({ refresh: vi.fn(), check: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("./session-actions", () => ({ checkStudyStepsAction: check }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
afterEach(() => {
  refresh.mockClear();
  check.mockReset();
  vi.useRealTimers();
});
function mount(locale: "es" | "en", remainingMs: number) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <StudyStepWait sessionId="session" remainingMs={remainingMs} />
    </NextIntlClientProvider>,
  );
}
describe("short-step wait notice", () => {
  it.each([
    [1, "1 segundo"],
    [60_000, "1 minuto"],
    [60_001, "2 minutos"],
    [600_000, "10 minutos"],
  ] as const)("rounds the server duration %i without creating a live countdown", (ms, expected) => {
    vi.useFakeTimers();
    mount("es", ms);
    expect(screen.getByText(new RegExp(expected))).toBeVisible();
    vi.advanceTimersByTime(3_600_000);
    expect(screen.getByText(new RegExp(expected))).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("reports that the timer is still pending, then refreshes once the server says it changed", async () => {
    check.mockResolvedValueOnce({ status: "waiting", remainingMs: 12_000 });
    check.mockResolvedValueOnce({ status: "refresh" });
    mount("es", 600_000);
    expect(screen.getByRole("link", { name: "Volver a Hoy" })).toHaveAttribute("href", "/app");
    expect(screen.getByText(es.StudySession.stepWaitHint)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar pendientes" }));
    expect(await screen.findByText(/Aún no hay tarjetas pendientes/)).toBeVisible();
    expect(screen.getByText(/12 segundos/)).toBeVisible();
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar pendientes" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(check).toHaveBeenCalledWith("session");
  });
  it("announces a failed check and lets the user retry", async () => {
    check.mockRejectedValueOnce(new Error("connection lost"));
    mount("en", 12_000);
    fireEvent.click(screen.getByRole("button", { name: "Check pending items" }));
    expect(await screen.findByText(/The session could not be checked/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Check pending items" })).toBeEnabled();
  });
  it("renders the English notice and actions", () => {
    mount("en", 600_000);
    expect(screen.getByText(/approximately 10 minutes/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Today" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Check pending items" })).toBeEnabled();
  });
});
