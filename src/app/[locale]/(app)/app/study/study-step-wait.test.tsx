// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";
import en from "../../../../../../messages/en.json";
import { StudyStepWait } from "./study-step-wait";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
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
  vi.useRealTimers();
});
function mount(locale: "es" | "en", remainingMs: number) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <StudyStepWait remainingMs={remainingMs} />
    </NextIntlClientProvider>,
  );
}
describe("short-step wait notice", () => {
  it.each([
    [1, "1 minuto"],
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
  it("lets the user check immediately or leave without waiting", () => {
    mount("es", 600_000);
    expect(screen.getByRole("link", { name: "Volver a Hoy" })).toHaveAttribute("href", "/app");
    expect(screen.getByText(es.StudySession.stepWaitHint)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Comprobar pendientes" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("renders the English notice and actions", () => {
    mount("en", 600_000);
    expect(screen.getByText(/approximately 10 minutes/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Back to Today" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Check pending items" })).toBeEnabled();
  });
});
