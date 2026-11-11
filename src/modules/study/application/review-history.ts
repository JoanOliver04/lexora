import {
  isMemoryPhase,
  isReviewRating,
  type MemoryPhase,
  type ReviewRating,
} from "../domain/memory";
import { isIanaTimeZone, studyDateWindow } from "../domain/study-day";

export const HISTORY_PAGE_SIZE = 40;
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
// Preserve PostgreSQL microseconds in the cursor: rounding to milliseconds skips tied rows.
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface HistoryCursor {
  at: string;
  id: string;
  asOf: string;
}

export interface HistoryFilters {
  from: string | null;
  until: string | null;
  deckId: string | null;
  conceptId: string | null;
  itemId: string | null;
  rating: ReviewRating | null;
  phase: MemoryPhase | null;
  cursor: HistoryCursor | null;
}

export interface HistoryEntry {
  id: string;
  reviewedAt: string;
  rating: ReviewRating;
  durationMs: number | null;
  phaseBefore: MemoryPhase | null;
  phaseAfter: MemoryPhase | null;
  dueAfter: string | null;
  itemId: string;
  mode: string;
  conceptId: string;
  title: string;
}

export interface HistoryRepository {
  list(input: {
    ownerId: string;
    courseId: string;
    filters: HistoryFilters;
    asOf: string;
    limit: number;
    fromUtc: string | null;
    untilUtc: string | null;
  }): Promise<HistoryEntry[]>;
}

export type HistoryQuery = Record<string, string | string[] | undefined>;

export function parseHistoryFilters(query: HistoryQuery, timeZone: string): HistoryFilters | null {
  if (!isIanaTimeZone(timeZone)) return null;
  const keys = ["from", "until", "deck", "concept", "item", "rating", "phase", "cursor"];
  if (keys.some((key) => query[key] !== undefined && typeof query[key] !== "string")) return null;
  const single = (key: string) => {
    const value = query[key];
    return typeof value === "string" && value !== "" ? value : null;
  };
  const from = single("from"),
    until = single("until");
  const deckId = single("deck"),
    conceptId = single("concept"),
    itemId = single("item");
  const rating = single("rating"),
    phase = single("phase"),
    rawCursor = single("cursor");
  if (from && !studyDateWindow(from, timeZone)) return null;
  if (until && !studyDateWindow(until, timeZone)) return null;
  if (from && until && from > until) return null;
  if ([deckId, conceptId, itemId].some((id) => id && !UUID.test(id))) return null;
  if (rating && !isReviewRating(rating)) return null;
  if (phase && !isMemoryPhase(phase)) return null;
  let cursor: HistoryCursor | null = null;
  if (rawCursor) {
    if (rawCursor.length > 200) return null;
    const [at, id, asOf, extra] = rawCursor.split("|");
    if (
      !at ||
      !id ||
      !asOf ||
      extra !== undefined ||
      !UUID.test(id) ||
      !INSTANT.test(at) ||
      !INSTANT.test(asOf) ||
      !Number.isFinite(Date.parse(at)) ||
      !Number.isFinite(Date.parse(asOf)) ||
      Date.parse(at) > Date.parse(asOf)
    )
      return null;
    cursor = { at, id, asOf };
  }
  return {
    from: from || null,
    until: until || null,
    deckId: deckId || null,
    conceptId: conceptId || null,
    itemId: itemId || null,
    rating: isReviewRating(rating) ? rating : null,
    phase: isMemoryPhase(phase) ? phase : null,
    cursor,
  };
}

export async function getReviewHistory(
  repository: HistoryRepository,
  input: { ownerId: string; courseId: string; query: HistoryQuery; timeZone: string; now: Date },
): Promise<
  | { ok: false }
  | { ok: true; entries: HistoryEntry[]; nextCursor: string | null; filters: HistoryFilters }
> {
  if (!UUID.test(input.ownerId) || !UUID.test(input.courseId))
    throw new Error("Verified identity required");
  const filters = parseHistoryFilters(input.query, input.timeZone);
  if (!filters) return { ok: false };
  const now = input.now.toISOString();
  const asOf = filters.cursor?.asOf ?? now;
  if (Date.parse(asOf) > input.now.getTime()) return { ok: false };
  const rows = await repository.list({
    ownerId: input.ownerId,
    courseId: input.courseId,
    filters,
    asOf,
    limit: HISTORY_PAGE_SIZE + 1,
    fromUtc: filters.from
      ? studyDateWindow(filters.from, input.timeZone)!.start.toISOString()
      : null,
    untilUtc: filters.until
      ? studyDateWindow(filters.until, input.timeZone)!.end.toISOString()
      : null,
  });
  const entries = rows.slice(0, HISTORY_PAGE_SIZE);
  const last = entries.at(-1);
  return {
    ok: true,
    entries,
    filters,
    nextCursor:
      rows.length > HISTORY_PAGE_SIZE && last ? `${last.reviewedAt}|${last.id}|${asOf}` : null,
  };
}
