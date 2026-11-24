import { expect, it, vi } from "vitest";
import type { FreeStudyCard } from "./free-study";
import { markedFreeStudyRun, nextFreeStudyCard } from "./free-study-run";

it("repeats each marked card once, keeps back navigation and uses the existing cards", async () => {
  const cards: FreeStudyCard[] = ["one", "two"].map((id) => ({
    id,
    content: {
      mode: "basic_recall",
      promptText: id,
      answerText: id,
      hintText: null,
      clozeAnswers: [],
    },
  }));
  const run = markedFreeStudyRun([...cards, cards[0]!]);
  const load = vi.fn(async () => cards);
  const first = await nextFreeStudyCard(run, load);
  const second = await nextFreeStudyCard(run, load);
  expect(new Set([first?.id, second?.id])).toEqual(new Set(["one", "two"]));
  run.cursor--;
  expect(await nextFreeStudyCard(run, load)).toBe(second);
  expect(await nextFreeStudyCard(run, load)).toBeNull();
  expect(run.trail).toHaveLength(2);
  expect(load).not.toHaveBeenCalled();
});
