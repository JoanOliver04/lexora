// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";
import en from "../../../../../../messages/en.json";
import type { StudyCardContent } from "@/modules/study/application/study-card";
import { StudyCardView } from "./study-card-view";
import type { ReviewFormState } from "./review-state";
import type { SessionChangeState } from "./session-actions";
import type { SessionControlInfo } from "./session-controls";

const { reveal, refresh, save, change } = vi.hoisted(() => ({
  reveal: vi.fn(),
  refresh: vi.fn(),
  save: vi.fn(),
  change: vi.fn(),
}));
vi.mock("./reveal-actions", () => ({ revealStudyCardAction: reveal }));
vi.mock("./review-request", () => ({ submitStudyReview: save }));
vi.mock("./session-actions", () => ({ changeStudySessionAction: change }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const content: StudyCardContent = {
  mode: "cloze",
  promptText: "We ___ to work.",
  hintText: "A verb",
  answerText: "We walk to work.",
  clozeAnswers: ["walk"],
  exampleText: "<script>example()</script>",
  explanationText: "A note",
};
const reviewKey = "60000000-0000-4000-8000-000000000001";
const revealed = { content, preview: { revision: null, intervals: [] }, reviewKey };
function mount(locale: "es" | "en" = "es", itemId = "item", session?: SessionControlInfo) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <StudyCardView
        locale={locale}
        sessionId="session"
        {...(session ? { session } : {})}
        card={{
          practiceItemId: itemId,
          revision: null,
          prompt: {
            mode: content.mode,
            promptText: content.promptText,
            hintText: content.hintText,
          },
        }}
      />
    </NextIntlClientProvider>,
  );
}
describe("study reveal and rating controls", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    reveal.mockReset().mockResolvedValue(revealed);
    save.mockReset().mockImplementation(async (_previous, data: FormData) => ({
      receipt: { rating: data.get("rating"), replayed: false },
      requestId: data.get("idempotencyKey"),
    }));
    refresh.mockClear();
    change.mockReset().mockResolvedValue({});
  });
  it("blocks card controls while pausing and sends only the observed session intent", async () => {
    let finish!: (state: SessionChangeState) => void;
    change.mockImplementation(
      () =>
        new Promise<SessionChangeState>((resolve) => {
          finish = resolve;
        }),
    );
    mount("es", "item", { status: "active", canComplete: false });
    expect(screen.queryByRole("button", { name: "Completar esta sesión" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pausar sesión" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Actualizando sesión…" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Revelar respuesta" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Abandonar sesión" })).toBeDisabled();
    expect(Object.fromEntries(change.mock.calls[0]![1] as FormData)).toEqual({
      locale: "es",
      sessionId: "session",
      expectedStatus: "active",
      action: "pause",
    });
    await act(async () => finish({}));
    expect(screen.getByRole("button", { name: "Pausar sesión" })).toBeEnabled();
  });
  it("blocks lifecycle changes while a review is pending or its outcome is unknown", async () => {
    let finish!: (state: ReviewFormState) => void;
    save.mockImplementation(
      () =>
        new Promise<ReviewFormState>((resolve) => {
          finish = resolve;
        }),
    );
    mount("es", "item", { status: "active", canComplete: false });
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Bien" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pausar sesión" })).toBeDisabled(),
    );
    await act(async () => finish({ error: "timeout", requestId: reviewKey }));
    expect(screen.getByRole("button", { name: "Pausar sesión" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Abandonar sesión" })).toBeDisabled();
    expect(screen.getByText(es.StudySession.resolveReviewFirst)).toBeVisible();
    expect(change).not.toHaveBeenCalled();
  });
  it("recovers a lifecycle transport rejection without announcing success", async () => {
    change.mockRejectedValue(new Error("connection lost"));
    mount("en", "item", { status: "active", canComplete: true });
    fireEvent.click(screen.getByRole("button", { name: "Complete this session" }));
    await waitFor(() =>
      expect(screen.getByText(en.StudySession.changeErrors.generic)).toBeVisible(),
    );
    expect(screen.getByRole("alert").parentElement).toHaveFocus();
    expect(screen.getByRole("button", { name: "Complete this session" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Check session status" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("does not allow a lifecycle-error reload to discard an unknown review intent", async () => {
    change.mockRejectedValue(new Error("lost lifecycle response"));
    save.mockResolvedValue({ error: "timeout", requestId: reviewKey });
    mount("es", "item", { status: "active", canComplete: false });
    fireEvent.click(screen.getByRole("button", { name: "Pausar sesión" }));
    await waitFor(() =>
      expect(screen.getByText(es.StudySession.changeErrors.generic)).toBeVisible(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Bien" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Comprobar estado de la sesión" })).toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Comprobar estado de la sesión" }));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("offers resume for a paused session, but no controls for terminal sessions", () => {
    const { unmount } = mount("en", "item", { status: "paused", canComplete: false });
    expect(screen.getByRole("button", { name: "Resume session" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Pause session" })).not.toBeInTheDocument();
    unmount();
    const completed = mount("en", "item", { status: "completed", canComplete: false });
    expect(screen.queryByTestId("session-controls")).not.toBeInTheDocument();
    completed.unmount();
    mount("en", "item", { status: "abandoned", canComplete: false });
    expect(screen.queryByTestId("session-controls")).not.toBeInTheDocument();
  });
  it("asks for recall and prevents ratings before reveal, with no answer or context in the DOM", () => {
    const { container } = mount();
    expect(screen.getByText(es.PracticeCard.recallInstruction)).toBeVisible();
    for (const name of ["Otra vez", "Difícil", "Bien", "Fácil"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    expect(screen.getByTestId("review-save-status")).toBeEmptyDOMElement();
    expect(container).not.toHaveTextContent(content.answerText);
    expect(container).not.toHaveTextContent("example()");
    expect(reveal).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("reveals authorized text, focuses the answer, and sends only the rating intent after reveal", async () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Respuesta" })).toHaveFocus());
    expect(screen.getByText(content.answerText)).toBeVisible();
    expect(screen.getByText(content.exampleText!)).toBeVisible();
    expect(screen.getByText("A note")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("listitem")).toHaveTextContent("walk");
    for (const name of ["Otra vez", "Difícil", "Bien", "Fácil"])
      expect(screen.getByRole("button", { name })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    await waitFor(() =>
      expect(screen.getByTestId("review-save-status")).toHaveTextContent(
        "Último repaso guardado: Bien.",
      ),
    );
    expect(save).toHaveBeenCalledTimes(1);
    const intent = save.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(intent)).toEqual({
      locale: "es",
      sessionId: "session",
      practiceItemId: "item",
      idempotencyKey: reviewKey,
      expectedRevision: "new",
      rating: "good",
    });
    expect(reveal).toHaveBeenCalledTimes(1);
    const data = reveal.mock.calls[0]![1] as FormData;
    expect(data.get("sessionId")).toBe("session");
    expect(data.get("practiceItemId")).toBe("item");
    expect(data.get("ownerId")).toBeNull();
  });
  it("keeps the front and ratings disabled after repeated failures and retries the same IDs", async () => {
    reveal.mockResolvedValue({ error: "generic" });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar revelado" }));
    await waitFor(() => expect(reveal).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Reintentar revelado" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reintentar revelado" }));
    await waitFor(() => expect(reveal).toHaveBeenCalledTimes(3));
    for (const call of reveal.mock.calls)
      expect((call[1] as FormData).get("practiceItemId")).toBe("item");
    expect(screen.getByRole("button", { name: "Bien" })).toBeDisabled();
    expect(screen.queryByText(content.answerText)).not.toBeInTheDocument();
  });
  it("offers a server refresh after the queue changes", async () => {
    reveal.mockResolvedValue({ error: "card-changed" });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Recargar sesión" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Bien" })).toBeDisabled();
  });
  it("blocks a second submit and ratings while reveal is pending", async () => {
    let finish!: (result: { content: StudyCardContent }) => void;
    reveal.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    const loading = await screen.findByRole("button", { name: "Cargando respuesta…" });
    expect(loading).toBeDisabled();
    fireEvent.click(loading);
    expect(reveal).toHaveBeenCalledTimes(1);
    finish(revealed);
    await screen.findByText(content.answerText);
  });
  it("renders complete English descriptions and omits missing optional context", async () => {
    reveal.mockResolvedValue({
      ...revealed,
      content: { ...content, exampleText: null, explanationText: null },
    });
    mount("en");
    for (const rating of Object.values(en.PracticeCard.ratings))
      expect(screen.getByText(rating.description)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    await screen.findByRole("heading", { name: "Answer" });
    expect(screen.queryByRole("heading", { name: "Example" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    await waitFor(() =>
      expect(screen.getByTestId("review-save-status")).toHaveTextContent(
        "Last review saved: Good.",
      ),
    );
  });
  it("a fresh mount has no revealed content or previous rating", async () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(content.answerText);
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    view.unmount();
    mount("es", "next-item");
    expect(screen.queryByText(content.answerText)).not.toBeInTheDocument();
    expect(screen.getByTestId("review-save-status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Bien" })).toBeDisabled();
  });
  it("shows approximate server durations only after reveal and can hide them without altering the rating", async () => {
    reveal.mockResolvedValue({
      content,
      reviewKey,
      preview: {
        revision: 7,
        intervals: [
          { rating: "again", intervalMs: 30_000 },
          { rating: "hard", intervalMs: 120_000 },
          { rating: "good", intervalMs: 7_200_000 },
          { rating: "easy", intervalMs: 691_200_000 },
        ],
      },
    });
    mount("en");
    expect(screen.queryByLabelText("Show approximate intervals")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    await screen.findByTestId("interval-good");
    expect(screen.getByTestId("interval-again")).toHaveTextContent("≈ less than 1 minute");
    expect(screen.getByTestId("interval-hard")).toHaveTextContent("≈ 2 minutes");
    expect(screen.getByTestId("interval-good")).toHaveTextContent("≈ 2 hours");
    expect(screen.getByTestId("interval-easy")).toHaveTextContent("≈ 8 days");
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    fireEvent.click(screen.getByLabelText("Show approximate intervals"));
    expect(screen.queryByTestId("interval-good")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByLabelText("Show approximate intervals"));
    expect(screen.getByTestId("interval-good")).toHaveTextContent("≈ 2 hours");
    expect(reveal).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect((save.mock.calls[0]![1] as FormData).get("expectedRevision")).toBe("7");
  });
  it("does not invent estimates for incompatible memory", async () => {
    reveal.mockResolvedValue({ content, previewUnavailable: true });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(es.PracticeCard.intervalUnavailable);
    expect(screen.queryByTestId("interval-good")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(es.PracticeCard.showIntervals)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bien" })).toBeDisabled();
    expect(save).not.toHaveBeenCalled();
  });
  it("blocks double clicks and every rating while saving, retaining the card until acknowledgement", async () => {
    let finish!: (result: ReviewFormState) => void;
    save.mockImplementation(
      () =>
        new Promise<ReviewFormState>((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(content.answerText);
    const button = screen.getByRole("button", { name: "Bien" });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() =>
      expect(screen.getByTestId("review-save-status")).toHaveTextContent("Guardando repaso…"),
    );
    for (const name of ["Otra vez", "Difícil", "Bien", "Fácil"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(screen.getByText(content.answerText)).toBeVisible();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () =>
      finish({ receipt: { rating: "good", replayed: false }, requestId: reviewKey }),
    );
    expect(screen.getByTestId("review-save-status")).toHaveTextContent(
      "Último repaso guardado: Bien.",
    );
  });
  it("does not announce success after an error and retries only the same rating/key/revision", async () => {
    save.mockResolvedValue({ error: "generic", requestId: reviewKey });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(content.answerText);
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    await screen.findByRole("alert");
    expect(screen.getByTestId("review-save-status")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Fácil" })).toBeDisabled();
    expect(screen.getByText(content.answerText)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(Object.fromEntries(save.mock.calls[0]![1] as FormData)).toEqual(
      Object.fromEntries(save.mock.calls[1]![1] as FormData),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
  it("keeps the saved status across the next front and when the queue becomes empty", async () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(content.answerText);
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    await waitFor(() =>
      expect(screen.getByTestId("review-save-status")).toHaveTextContent("guardado"),
    );
    view.rerender(
      <NextIntlClientProvider locale="es" messages={es}>
        <StudyCardView
          locale="es"
          sessionId="session"
          card={{
            practiceItemId: "next",
            revision: null,
            prompt: { mode: "basic_recall", promptText: "Next front", hintText: null },
          }}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Next front")).toBeVisible();
    expect(screen.getByRole("heading", { name: es.PracticeCard.heading })).toHaveFocus();
    expect(screen.queryByText(content.answerText)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bien" })).toBeDisabled();
    expect(screen.getByTestId("review-save-status")).toHaveTextContent("guardado");
    view.rerender(
      <NextIntlClientProvider locale="es" messages={es}>
        <StudyCardView locale="es" sessionId="session" card={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("study-card")).not.toBeInTheDocument();
    expect(screen.getByTestId("review-save-status")).toHaveTextContent("guardado");
    expect(screen.getByTestId("review-save-status")).toHaveFocus();
  });
  it("explicit reload clears a rejected reveal even if the same card/revision is still pending", async () => {
    save.mockResolvedValue({ error: "revision-conflict", requestId: reviewKey });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(content.answerText);
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    fireEvent.click(await screen.findByRole("button", { name: "Recargar sesión" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(content.answerText)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bien" })).toBeDisabled();
  });
  it("preserves the revealed card offline and never sends automatically on reconnect", async () => {
    const connection = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(content.answerText);
    connection.mockReturnValue(false);
    act(() => window.dispatchEvent(new Event("offline")));
    expect(screen.getByText(es.PracticeCard.offlineHint)).toBeVisible();
    for (const name of ["Otra vez", "Difícil", "Bien", "Fácil"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    expect(screen.getByText(content.answerText)).toBeVisible();
    connection.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Bien" })).toBeEnabled();
    expect(screen.getByTestId("review-save-status")).toBeEmptyDOMElement();
  });
  it("recovers a rejected reveal transport instead of unmounting the card", async () => {
    reveal
      .mockRejectedValueOnce(new Error("PRIVATE_NETWORK_DETAIL"))
      .mockResolvedValueOnce(revealed);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("PRIVATE_NETWORK_DETAIL")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar revelado" }));
    await screen.findByText(content.answerText);
  });
  it("retries an unknown timeout outcome with the same intent and refreshes only after a receipt", async () => {
    save.mockResolvedValueOnce({ requestId: reviewKey, error: "timeout" });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(content.answerText);
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    await screen.findByText(es.PracticeCard.saveErrors.timeout);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByText(content.answerText)).toBeVisible();
    expect(screen.getByRole("button", { name: "Fácil" })).toBeDisabled();
    expect(screen.getByTestId("review-save-status")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar guardado" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(save.mock.calls[0]![1] as FormData)).toEqual(
      Object.fromEntries(save.mock.calls[1]![1] as FormData),
    );
    expect(screen.getByRole("button", { name: "Bien" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Recargar sesión" })).toBeEnabled();
  });
  it.each([
    ["1", "again"],
    ["2", "hard"],
    ["3", "good"],
    ["4", "easy"],
  ])("reveals with Space and saves rating %s through the same form", async (key, rating) => {
    mount();
    const heading = screen.getByRole("heading", { name: es.PracticeCard.heading });
    expect(heading).toHaveFocus();
    expect(heading).toHaveAccessibleDescription(/We ___ to work/);
    expect(heading).not.toHaveAccessibleDescription(/We walk to work/);
    fireEvent.keyDown(heading, { key });
    expect(save).not.toHaveBeenCalled();
    fireEvent.keyDown(heading, { key: " " });
    const answer = await screen.findByRole("heading", { name: "Respuesta" });
    await waitFor(() => expect(answer).toHaveFocus());
    expect(answer).toHaveAccessibleDescription(/We walk to work/);
    expect(screen.getByRole("button", { name: "Bien" })).toHaveAttribute("aria-keyshortcuts", "3");
    fireEvent.keyDown(answer, { key });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect((save.mock.calls[0]![1] as FormData).get("rating")).toBe(rating);
    fireEvent.keyDown(answer, { key });
    expect(save).toHaveBeenCalledTimes(1);
  });
  it.each([
    { repeat: true },
    { isComposing: true },
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
  ])("ignores repeated, composing or modified shortcut events: %j", (options) => {
    mount();
    fireEvent.keyDown(screen.getByRole("heading", { name: es.PracticeCard.heading }), {
      key: " ",
      ...options,
    });
    expect(reveal).not.toHaveBeenCalled();
  });
  it("does not intercept native controls, editable fields or keys outside the card", async () => {
    mount();
    fireEvent.keyDown(document.body, { key: " " });
    fireEvent.keyDown(screen.getByRole("button", { name: "Revelar respuesta" }), { key: " " });
    for (const tag of ["input", "textarea", "select", "button", "a"]) {
      const control = document.createElement(tag);
      screen.getByTestId("study-card").append(control);
      fireEvent.keyDown(control, { key: " " });
      control.remove();
    }
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    screen.getByTestId("study-card").append(editable);
    fireEvent.keyDown(editable, { key: " " });
    editable.remove();
    expect(reveal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    const checkbox = await screen.findByRole("checkbox");
    fireEvent.keyDown(checkbox, { key: "3" });
    fireEvent.keyDown(checkbox, { key: " " });
    expect(save).not.toHaveBeenCalled();
  });
  it("blocks keyboard activation offline and while a lifecycle change disables the card", async () => {
    const connection = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    let finish!: (state: SessionChangeState) => void;
    change.mockImplementation(
      () => new Promise<SessionChangeState>((resolve) => (finish = resolve)),
    );
    mount("es", "item", { status: "active", canComplete: false });
    const heading = screen.getByRole("heading", { name: es.PracticeCard.heading });
    fireEvent.keyDown(heading, { key: " " });
    expect(reveal).not.toHaveBeenCalled();
    connection.mockReturnValue(true);
    act(() => window.dispatchEvent(new Event("online")));
    fireEvent.click(screen.getByRole("button", { name: "Pausar sesión" }));
    fireEvent.keyDown(heading, { key: " " });
    expect(reveal).not.toHaveBeenCalled();
    await act(async () => finish({}));
  });
  it("respects an already cancelled event and removes the listener when the card unmounts", () => {
    const view = mount();
    const heading = screen.getByRole("heading", { name: es.PracticeCard.heading });
    const cancelled = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    cancelled.preventDefault();
    fireEvent(heading, cancelled);
    expect(reveal).not.toHaveBeenCalled();
    view.unmount();
    fireEvent.keyDown(heading, { key: " " });
    expect(reveal).not.toHaveBeenCalled();
  });
  it("blocks repeated Space events during reveal and permits an explicit retry after failure", async () => {
    let finish!: (state: { error: "generic" }) => void;
    reveal.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    mount();
    const heading = screen.getByRole("heading", { name: es.PracticeCard.heading });
    act(() => {
      fireEvent.keyDown(heading, { key: " " });
      fireEvent.keyDown(heading, { key: " " });
    });
    await waitFor(() => expect(reveal).toHaveBeenCalledTimes(1));
    await act(async () => finish({ error: "generic" }));
    const error = screen.getByRole("alert").parentElement!;
    expect(error).toHaveFocus();
    reveal.mockResolvedValueOnce(revealed);
    fireEvent.keyDown(error, { key: " " });
    await screen.findByRole("heading", { name: "Respuesta" });
    expect(reveal).toHaveBeenCalledTimes(2);
  });
  it("retains the exact rating on a keyboard retry and blocks double key submissions", async () => {
    let finish!: (state: ReviewFormState) => void;
    save.mockImplementation(() => new Promise<ReviewFormState>((resolve) => (finish = resolve)));
    mount();
    fireEvent.keyDown(screen.getByRole("heading", { name: es.PracticeCard.heading }), { key: " " });
    const answer = await screen.findByRole("heading", { name: "Respuesta" });
    act(() => {
      fireEvent.keyDown(answer, { key: "3" });
      fireEvent.keyDown(answer, { key: "3" });
      fireEvent.keyDown(answer, { key: "4" });
    });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    await act(async () => finish({ error: "timeout", requestId: reviewKey }));
    const error = screen.getByRole("alert").parentElement!;
    expect(error).toHaveFocus();
    fireEvent.keyDown(error, { key: "4" });
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(error, { key: "3" });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(Object.fromEntries(save.mock.calls[0]![1] as FormData)).toEqual(
      Object.fromEntries(save.mock.calls[1]![1] as FormData),
    );
    await act(async () => finish({ error: "revision-conflict", requestId: reviewKey }));
    fireEvent.keyDown(error, { key: "3" });
    expect(save).toHaveBeenCalledTimes(2);
  });
});
