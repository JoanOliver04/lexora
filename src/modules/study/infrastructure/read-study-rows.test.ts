import { describe, expect, it, vi } from "vitest";

import { readStudyRows, studyIdBatches, STUDY_PAGE_SIZE } from "./read-study-rows";

describe("study reads", () => {
  it("fails the whole read if a later page fails, rather than returning partial counts", async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: Array<number>(STUDY_PAGE_SIZE).fill(1), error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "denied" } });
    await expect(readStudyRows<number>(page, "read failed")).rejects.toMatchObject({
      name: "StudyError",
      kind: "forbidden",
    });
  });

  it("deduplicates identifiers and uses bounded batches", () => {
    const ids = Array.from({ length: 201 }, (_, index) => `id-${index}`);
    const batches = studyIdBatches([...ids, ...ids]);
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 1]);
    expect(batches.flat()).toEqual(ids);
    expect(studyIdBatches([])).toEqual([]);
  });
});
