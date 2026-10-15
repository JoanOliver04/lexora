// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";
import en from "../../../../../../messages/en.json";
import type { StudyCardContent } from "@/modules/study/application/study-card";
import { StudyCardView } from "./study-card-view";
import type { ReviewFormState } from "./review-actions";

const { reveal, refresh, save } = vi.hoisted(() => ({
  reveal: vi.fn(),
  refresh: vi.fn(),
  save: vi.fn(),
}));
vi.mock("./reveal-actions", () => ({ revealStudyCardAction: reveal }));
vi.mock("./review-actions", () => ({ saveStudyReviewAction: save }));
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
function mount(locale: "es" | "en" = "es", itemId = "item") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <StudyCardView
        locale={locale}
        sessionId="session"
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
  beforeEach(() => {
    reveal.mockReset().mockResolvedValue(revealed);
    save.mockReset().mockImplementation(async (_previous, data: FormData) => ({
      receipt: { rating: data.get("rating"), replayed: false },
      requestId: data.get("idempotencyKey"),
    }));
    refresh.mockClear();
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
});
