import { FREE_STUDY_BATCH_SIZE, type FreeStudyCard, type FreeStudyLength } from "./free-study";

export interface FreeStudyRun {
  pool: string[];
  order: string[];
  offset: number;
  cursor: number;
  trail: FreeStudyCard[];
  contents: Map<string, FreeStudyCard | null>;
  kind: "continuous" | "bounded" | "marked";
}

export function newFreeStudyRun(ids: string[]): FreeStudyRun {
  return {
    pool: ids,
    order: [],
    offset: 0,
    cursor: -1,
    trail: [],
    contents: new Map(),
    kind: "continuous",
  };
}

/** A finite pass over cards already seen in this session. */
export function markedFreeStudyRun(cards: FreeStudyCard[]): FreeStudyRun {
  const contents = new Map(cards.map((card) => [card.id, card]));
  const run = newFreeStudyRun([...contents.keys()]);
  return { ...run, contents, kind: "marked" };
}

function shuffle(ids: string[], lastId?: string): string[] {
  const order = [...ids];
  for (let index = order.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [order[index], order[other]] = [order[other]!, order[index]!];
  }
  if (order.length > 1 && order[0] === lastId) {
    const other = 1 + Math.floor(Math.random() * (order.length - 1));
    [order[0], order[other]] = [order[other]!, order[0]!];
  }
  return order;
}

interface PreparedFreeStudyRound {
  order: string[];
  cards: FreeStudyCard[];
  kind: "continuous" | "bounded";
}

/** Short rounds carry only playable cards. Larger rounds fetch later batches on demand. */
export async function prepareFreeStudyRound(
  ids: string[],
  load: (ids: string[]) => Promise<FreeStudyCard[]>,
  length: FreeStudyLength = "continuous",
): Promise<PreparedFreeStudyRound> {
  const order = shuffle(ids);
  if (length === "five" || length === "ten") {
    const limit = length === "five" ? 5 : 10;
    const cards: FreeStudyCard[] = [];
    for (let offset = 0; offset < order.length && cards.length < limit; offset += limit) {
      const batch = order.slice(offset, offset + limit);
      const available = new Map((await load(batch)).map((card) => [card.id, card]));
      for (const id of batch) {
        const card = available.get(id);
        if (card) cards.push(card);
        if (cards.length === limit) break;
      }
    }
    return { order: cards.map(({ id }) => id), cards, kind: "bounded" };
  }
  const batch = order.slice(0, FREE_STUDY_BATCH_SIZE);
  const cards = batch.length ? await load(batch) : [];
  const present = new Set(cards.map(({ id }) => id));
  return {
    order: [...batch.filter((id) => present.has(id)), ...order.slice(batch.length)],
    cards,
    kind: length === "once" ? "bounded" : "continuous",
  };
}

export function openPreparedFreeStudyRun({
  order,
  cards,
  kind,
}: PreparedFreeStudyRound): FreeStudyRun {
  const run = newFreeStudyRun(order);
  run.kind = kind;
  run.order = order;
  run.contents = new Map(cards.map((card) => [card.id, card]));
  return run;
}

/** Revisit the existing trail before drawing from the next shuffled round. */
export async function nextFreeStudyCard(
  run: FreeStudyRun,
  load: (ids: string[]) => Promise<FreeStudyCard[]>,
): Promise<FreeStudyCard | null> {
  if (run.cursor + 1 < run.trail.length) return run.trail[++run.cursor]!;
  while (run.pool.length > 0) {
    if (run.offset === run.order.length) {
      if (run.kind !== "continuous" && run.order.length > 0) return null;
      run.order = shuffle(run.pool, run.trail.at(-1)?.id);
      run.offset = 0;
    }

    const id = run.order[run.offset]!;
    if (!run.contents.has(id)) {
      const batch = run.order
        .slice(run.offset, run.offset + FREE_STUDY_BATCH_SIZE)
        .filter((item) => !run.contents.has(item));
      const cards = new Map((await load(batch)).map((card) => [card.id, card]));
      for (const item of batch) run.contents.set(item, cards.get(item) ?? null);
      if (cards.size !== batch.length) {
        run.pool = run.pool.filter((item) => run.contents.get(item) !== null);
      }
    }

    run.offset++;
    const card = run.contents.get(id);
    if (!card) continue;
    run.trail.push(card);
    run.cursor++;
    return card;
  }
  return null;
}
