// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import es from "../../../../../../messages/es.json";
import en from "../../../../../../messages/en.json";
import type { StudyCardContent } from "@/modules/study/application/study-card";
import { StudyCardView } from "./study-card-view";

const { reveal, refresh } = vi.hoisted(() => ({ reveal: vi.fn(), refresh: vi.fn() }));
vi.mock("./reveal-actions", () => ({ revealStudyCardAction: reveal }));
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
function mount(locale: "es" | "en" = "es", itemId = "item") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? es : en}>
      <StudyCardView
        locale={locale}
        sessionId="session"
        card={{
          practiceItemId: itemId,
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
    reveal.mockReset().mockResolvedValue({ content });
    refresh.mockClear();
  });
  it("asks for recall and prevents ratings before reveal, with no answer or context in the DOM", () => {
    const { container } = mount();
    expect(screen.getByText(es.PracticeCard.recallInstruction)).toBeVisible();
    for (const name of ["Otra vez", "Difícil", "Bien", "Fácil"])
      expect(screen.getByRole("button", { name })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(content.answerText);
    expect(container).not.toHaveTextContent("example()");
    expect(reveal).not.toHaveBeenCalled();
  });
  it("reveals authorized text, focuses the answer, then selects every rating locally without advancing", async () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Respuesta" })).toHaveFocus());
    expect(screen.getByText(content.answerText)).toBeVisible();
    expect(screen.getByText(content.exampleText!)).toBeVisible();
    expect(screen.getByText("A note")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("listitem")).toHaveTextContent("walk");
    for (const name of ["Otra vez", "Difícil", "Bien", "Fácil"]) {
      const button = screen.getByRole("button", { name });
      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("status")).toHaveTextContent(
        `Valoración elegida: ${name}. No guardada.`,
      );
    }
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
    finish({ content });
    await screen.findByText(content.answerText);
  });
  it("renders complete English descriptions and omits missing optional context", async () => {
    reveal.mockResolvedValue({ content: { ...content, exampleText: null, explanationText: null } });
    mount("en");
    for (const rating of Object.values(en.PracticeCard.ratings))
      expect(screen.getByText(rating.description)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Reveal answer" }));
    await screen.findByRole("heading", { name: "Answer" });
    expect(screen.queryByRole("heading", { name: "Example" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(screen.getByRole("status")).toHaveTextContent("Rating selected: Good. Not saved.");
  });
  it("a fresh mount has no revealed content or previous rating", async () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(content.answerText);
    fireEvent.click(screen.getByRole("button", { name: "Bien" }));
    view.unmount();
    mount("es", "next-item");
    expect(screen.queryByText(content.answerText)).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bien" })).toBeDisabled();
  });
  it("shows approximate server durations only after reveal and can hide them without altering the rating", async () => {
    reveal.mockResolvedValue({
      content,
      preview: {
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
  });
  it("does not invent estimates for incompatible memory", async () => {
    reveal.mockResolvedValue({ content, previewUnavailable: true });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Revelar respuesta" }));
    await screen.findByText(es.PracticeCard.intervalUnavailable);
    expect(screen.queryByTestId("interval-good")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(es.PracticeCard.showIntervals)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bien" })).toBeEnabled();
  });
});
