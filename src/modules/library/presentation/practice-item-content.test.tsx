// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PracticeItemContent } from "@/modules/library/application/practice-item-content";
import { PracticeItemAnswer, PracticeItemPrompt } from "./practice-item-content";

const content: PracticeItemContent = {
  mode: "basic_recognition",
  promptText: "Hello",
  hintText: null,
  answerText: "Hola",
  clozeAnswers: [],
};
describe("shared practice item renderer", () => {
  it.each(["basic_recognition", "basic_recall", "cloze"] as const)(
    "renders the %s front without mounting answers",
    (mode) => {
      const { container } = render(
        <PracticeItemPrompt content={{ ...content, mode }} hintLabel="Hint" />,
      );
      expect(screen.getByText("Hello")).toBeVisible();
      expect(container).not.toHaveTextContent("Hola");
      expect(screen.queryByText("Hint:")).not.toBeInTheDocument();
      expect(container.querySelector("ol")).toBeNull();
    },
  );
  it("renders prompt and hint as literal multiline text, never HTML", () => {
    const { container } = render(
      <PracticeItemPrompt
        content={{
          ...content,
          promptText: '<img src=x onerror="alert(1)">\n<script>bad()</script>',
          hintText: '<a href="javascript:bad()">hint</a>',
        }}
        hintLabel="Pista"
      />,
    );
    expect(container.textContent).toContain("<img src=x");
    expect(container.textContent).toContain("\n<script>");
    expect(container.textContent).toContain('Pista: <a href="javascript:');
    expect(container.querySelector("img, script, a")).toBeNull();
  });
  it.each(["basic_recognition", "basic_recall"] as const)(
    "renders the %s answer in its saved direction",
    (mode) => {
      render(<PracticeItemAnswer content={{ ...content, mode }} clozeAnswersLabel="Solutions" />);
      expect(screen.getByText("Hola")).toBeVisible();
      expect(screen.queryByText("Hello")).not.toBeInTheDocument();
      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    },
  );
  it("renders cloze solutions as an ordered literal list, preserving duplicates", () => {
    const { container } = render(
      <PracticeItemAnswer
        content={{
          ...content,
          mode: "cloze",
          answerText: "<script>answer()</script>",
          clozeAnswers: ["walk", "<b>run</b>", "walk"],
        }}
        clozeAnswersLabel="Soluciones"
      />,
    );
    expect(screen.getByText("Soluciones")).toBeVisible();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "walk",
      "<b>run</b>",
      "walk",
    ]);
    expect(container.querySelector("script, b")).toBeNull();
  });
  it("allows very long unbroken text to wrap on either side", () => {
    const long = "a".repeat(4000);
    const { container } = render(
      <>
        <PracticeItemPrompt
          content={{ ...content, promptText: long, hintText: long }}
          hintLabel="Hint"
        />
        <PracticeItemAnswer
          content={{ ...content, answerText: long }}
          clozeAnswersLabel="Solutions"
        />
      </>,
    );
    for (const element of container.querySelectorAll("p")) {
      expect(element.className).toContain("[overflow-wrap:anywhere]");
      expect(element.className).toContain("whitespace-pre-wrap");
    }
  });
});
