import { describe, expect, it, vi } from "vitest";
import {
  getReviewHistory,
  parseHistoryFilters,
  type HistoryEntry,
  type HistoryRepository,
} from "./review-history";
import { studyDateWindow } from "../domain/study-day";

const ownerId = "11111111-1111-4111-8111-111111111111";
const courseId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-11-11T12:00:00Z");
const input = { ownerId, courseId, query: {}, timeZone: "Europe/Madrid", now };

describe("Review history query boundary", () => {
  it.each([
    { from: "2026-02-30" },
    { from: "2026-11-12", until: "2026-11-11" },
    { rating: "great" },
    { phase: "3" },
    { deck: "x),owner_id.neq.foo" },
    { concept: [courseId, ownerId] },
    { cursor: "x" },
    { from: "2026-1-1" },
    { cursor: `2026-11-10T00:00:00Z|${ownerId}|2026-11-09T00:00:00Z` },
  ])("rejects malformed input before repository access: %j", async (query) => {
    const list = vi.fn();
    expect(await getReviewHistory({ list }, { ...input, query })).toEqual({ ok: false });
    expect(list).not.toHaveBeenCalled();
  });
  it("requires a verified owner and course", async () => {
    const list = vi.fn();
    await expect(getReviewHistory({ list }, { ...input, ownerId: "" })).rejects.toThrow("identity");
    expect(list).not.toHaveBeenCalled();
  });
  it("converts inclusive civil dates into exclusive UTC boundaries across DST", async () => {
    const list = vi.fn<HistoryRepository["list"]>().mockResolvedValue([]);
    await getReviewHistory(
      { list },
      { ...input, query: { from: "2026-03-29", until: "2026-03-29" } },
    );
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId,
        courseId,
        limit: 41,
        asOf: now.toISOString(),
        fromUtc: "2026-03-28T23:00:00.000Z",
        untilUtc: "2026-03-29T22:00:00.000Z",
      }),
    );
    const autumn = studyDateWindow("2026-10-25", "Europe/Madrid")!;
    expect(autumn.end.getTime() - autumn.start.getTime()).toBe(25 * 3600000);
  });
  it("preserves PostgreSQL microseconds and fixes an upper bound across pages", async () => {
    const row: HistoryEntry = {
      id: ownerId,
      reviewedAt: "2026-11-10T10:00:00.123456+00:00",
      rating: "good",
      durationMs: null,
      phaseBefore: "new",
      phaseAfter: "review",
      dueAfter: null,
      itemId: ownerId,
      mode: "basic_recall",
      conceptId: ownerId,
      title: "Original",
    };
    const list = vi
      .fn<HistoryRepository["list"]>()
      .mockResolvedValue(Array.from({ length: 41 }, () => row));
    const first = await getReviewHistory({ list }, input);
    expect(first.ok).toBe(true);
    if (!first.ok || !first.nextCursor) throw new Error("Expected next cursor");
    expect(first.entries).toHaveLength(40);
    expect(first.nextCursor).toContain(".123456+00:00");
    await getReviewHistory(
      { list },
      { ...input, now: new Date("2026-11-12T12:00:00Z"), query: { cursor: first.nextCursor } },
    );
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ asOf: now.toISOString() }));
  });
  it("rejects a future page boundary and an invalid timezone", async () => {
    const list = vi.fn();
    expect(
      await getReviewHistory(
        { list },
        { ...input, query: { cursor: `2026-11-10T00:00:00Z|${ownerId}|2027-01-01T00:00:00Z` } },
      ),
    ).toEqual({ ok: false });
    expect(parseHistoryFilters({}, "Invalid/Zone")).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });
});
