import { expect, it, vi } from "vitest";
import type { FreeStudyCard } from "./free-study";
import {
  markedFreeStudyRun,
  nextFreeStudyCard,
  openPreparedFreeStudyRun,
  prepareFreeStudyRound,
} from "./free-study-run";

function makeCard(id: string): FreeStudyCard {
  return {
    id,
    content: {
      mode: "basic_recall",
      promptText: id,
      answerText: id,
      hintText: null,
      clozeAnswers: [],
    },
  };
}

it("uses the opening batch before fetching the rest and skips cards that disappeared", async () => {
  const ids = Array.from({ length: 16 }, (_, index) => String(index));
  const initial = vi.fn(async (batch: string[]) => batch.slice(1).reverse().map(makeCard));
  const round = await prepareFreeStudyRound(ids, initial);
  const batch = initial.mock.calls[0]![0];
  expect(batch).toHaveLength(12);
  const run = openPreparedFreeStudyRun(round);
  const more = vi.fn(async (batch: string[]) => batch.map(makeCard));
  for (const id of batch.slice(1)) {
    expect((await nextFreeStudyCard(run, more))?.id).toBe(id);
  }
  expect(more).not.toHaveBeenCalled();
  for (const id of round.order.slice(11)) {
    expect((await nextFreeStudyCard(run, more))?.id).toBe(id);
  }
  expect(more).toHaveBeenCalledTimes(1);
  expect(new Set(run.trail.map(({ id }) => id))).toEqual(
    new Set(ids.filter((id) => id !== batch[0])),
  );
});

it("needs no card request for an empty selection and tolerates a vanished opening batch", async () => {
  const load = vi.fn(async () => []);
  expect(await prepareFreeStudyRound([], load)).toEqual({ order: [], cards: [] });
  expect(load).not.toHaveBeenCalled();
  const ids = Array.from({ length: 13 }, (_, index) => String(index));
  const run = openPreparedFreeStudyRun(await prepareFreeStudyRound(ids, load));
  const more = vi.fn(async (batch: string[]) => batch.map(makeCard));
  expect(await nextFreeStudyCard(run, more)).toEqual(makeCard(run.pool[0]!));
  expect(run.pool).toHaveLength(1);
});

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
