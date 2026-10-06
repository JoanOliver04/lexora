// @vitest-environment jsdom

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import es from "../../../../../../messages/es.json";
import en from "../../../../../../messages/en.json";
import { ScopeForm } from "./scope-form";
import type { StudySessionFormState } from "./actions";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("./actions", () => ({ createStudySessionAction: create }));
const SESSION = "50000000-0000-4000-8000-000000000001";
const DECK = "d0000000-0000-4000-8000-000000000001";
function view(locale: "es" | "en" = "es", availableCount = 2, selected = false) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? es : en}
      timeZone="Europe/Madrid"
      now={new Date("2026-10-06T10:00:00Z")}
    >
      <ScopeForm
        locale={locale}
        sessionId={SESSION}
        decks={[{ id: DECK, title: "Vocabulario" }]}
        initialScope={{ deckIds: selected ? [DECK] : null }}
        availableCount={availableCount}
      />
    </NextIntlClientProvider>
  );
}
describe("scope form", () => {
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ error: "generic" });
  });
  it("preserves a selected scope passed from Today", () => {
    render(view("es", 2, true));
    expect(screen.getByRole("radio", { name: "Elegir algunos mazos" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Vocabulario" })).toBeChecked();
  });
  it("selecting a checkbox chooses the subset and retries retain the same request ID", async () => {
    render(view());
    await userEvent.click(screen.getByRole("checkbox", { name: "Vocabulario" }));
    expect(screen.getByRole("radio", { name: "Elegir algunos mazos" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Todos los mazos activos" })).not.toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Crear sesión" }));
    await screen.findByRole("alert");
    expect(create.mock.calls[0]?.[1].get("scopeMode")).toBe("selected");
    expect(screen.getByRole("radio", { name: "Elegir algunos mazos" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Crear sesión" }));
    expect(create).toHaveBeenCalledTimes(2);
    for (const [, data] of create.mock.calls) {
      expect(data.get("sessionId")).toBe(SESSION);
      expect(data.get("scopeMode")).toBe("selected");
      expect(data.getAll("deckIds")).toEqual([DECK]);
    }
  });
  it("takes focus to the invalid deck group after rejecting an empty selection", async () => {
    create.mockResolvedValue({ error: "invalid-scope" });
    render(view());
    await userEvent.click(screen.getByRole("radio", { name: "Elegir algunos mazos" }));
    await userEvent.click(screen.getByRole("button", { name: "Crear sesión" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("group", { name: "Mazos del curso" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("group", { name: "Mazos del curso" })).toHaveFocus();
  });
  it("disables the initial submit when the course has no available items", () => {
    render(view("es", 0));
    expect(screen.getByRole("button", { name: "Crear sesión" })).toBeDisabled();
    expect(screen.getByText(/Ahora no hay ítems disponibles/)).toBeVisible();
  });
  it("offers all active decks in English", () => {
    render(view("en"));
    expect(screen.getByRole("radio", { name: "All active decks" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Create session" })).toBeEnabled();
  });
  it("blocks a second submission while creation is pending", async () => {
    let finish: (() => void) | undefined;
    create.mockImplementation(
      () =>
        new Promise<StudySessionFormState>((resolve) => {
          finish = () => resolve({ error: "generic" });
        }),
    );
    render(view());
    await userEvent.click(screen.getByRole("button", { name: "Crear sesión" }));
    const button = screen.getByRole("button", { name: "Creando sesión…" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(create).toHaveBeenCalledOnce();
    await act(async () => {
      finish?.();
    });
  });
});
