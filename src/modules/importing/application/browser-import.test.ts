import { describe, expect, it, vi } from "vitest";
import { prepareBrowserImport, nextImportBatch } from "./prepare-browser-import";
import { runBrowserImport } from "./run-browser-import";
import {
  IMPORT_BATCH_BYTES,
  preparePersistenceRecords,
  transferImport,
  type ImportDescriptor,
  type ImportProgress,
  type ImportTransferPort,
  type ImportTransferRecord,
  type ImportTransferRepository,
} from "./import-transfer";

const id = "10000000-0000-4000-8000-000000000001";
const descriptor: ImportDescriptor = {
  id,
  courseId: id,
  deckId: id,
  filename: "synthetic.tsv",
  fileHash: "a".repeat(64),
  rowsTotal: 3,
  mapping: {
    front: 0,
    back: 1,
    tags: 2,
    createReverse: false,
    strategy: "copy",
    originalBytes: 100,
  },
};
const initial: ImportProgress = {
  ...descriptor,
  status: "importing",
  processedRows: 0,
  rowsCreated: 0,
  rowsSkipped: 0,
  rowsDuplicate: 0,
  rowsFailed: 0,
  lastSourceRow: 0,
};
const records: ImportTransferRecord[] = Array.from({ length: 3 }, (_, index) => ({
  kind: "valid",
  rowNumber: index + 1,
  front: `Synthetic ${index}`,
  back: "Meaning",
  tags: [],
}));
const signal = () => new AbortController().signal;

describe("browser import preparation and recovery", () => {
  it("does not publish progress after cancellation even if the transport returns an acknowledgement", async () => {
    const abort = new AbortController(),
      onProgress = vi.fn();
    const transfer: ImportTransferPort = async () => {
      abort.abort();
      return { ok: true, job: initial };
    };
    await expect(
      runBrowserImport({
        descriptor,
        records,
        locale: "en",
        transfer,
        signal: abort.signal,
        onProgress,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(onProgress).not.toHaveBeenCalled();
  });
  it("converts HTML once, retains encoded literal text, records invalid rows and uses database Unicode keys", async () => {
    const transfer = vi.fn<ImportTransferPort>(async (request) => {
      if (request.action !== "duplicates") throw new Error("Unexpected write during preview");
      return {
        ok: true,
        matches: request.rows.map((row) => ({
          rowNumber: row.rowNumber,
          canonicalKey: row.rowNumber < 3 ? "same-database-key" : row.front,
          existingTitles: [],
        })),
      };
    });
    const yielded = vi.fn(async () => undefined);
    const prepared = await prepareBrowserImport({
      courseId: id,
      locale: "en",
      mapping: { front: 0, back: 1, tags: 2 },
      rawRows: [
        { rowNumber: 1, columns: ["İ", "meaning", ""] },
        { rowNumber: 2, columns: ["i", "other meaning", ""] },
        { rowNumber: 3, columns: ["&lt;script&gt;vocabulary&lt;/script&gt;", "literal", ""] },
        { rowNumber: 4, columns: ["a".repeat(199) + "😀", "invalid title", ""] },
      ],
      transfer,
      yieldControl: yielded,
      signal: signal(),
    });
    expect(prepared).toMatchObject({
      validCount: 3,
      issueCount: 1,
      newCount: 2,
      duplicateCount: 1,
    });
    expect(prepared.duplicateHits[0]).toMatchObject({ rowNumber: 2, otherFileRows: [1] });
    expect(prepared.records[2]).toMatchObject({
      kind: "valid",
      front: "<script>vocabulary</script>",
    });
    expect(preparePersistenceRecords([prepared.records[2]!], "en")[0]).toMatchObject({
      kind: "valid",
      front: "<script>vocabulary</script>",
    });
    expect(prepared.records[3]).toMatchObject({ kind: "error", code: "front_too_long" });
    expect(JSON.stringify(prepared.records).includes("\\ud83d")).toBe(false);
    expect(yielded).toHaveBeenCalledOnce();
  });

  it("packs by expanded tag payload bytes and row count without losing rows", () => {
    const large: ImportTransferRecord[] = Array.from({ length: 600 }, (_, index) => ({
      kind: "valid",
      rowNumber: index + 1,
      front: `Synthetic ${index}`,
      back: "Meaning",
      tags: Array.from({ length: 150 }, (_, tag) => `tag${tag}`),
    }));
    let offset = 0,
      batches = 0;
    while (offset < large.length) {
      const batch = nextImportBatch(large, offset, "es");
      expect(batch.length).toBeGreaterThan(0);
      expect(batch.length).toBeLessThan(250);
      expect(
        new TextEncoder().encode(JSON.stringify(preparePersistenceRecords(batch, "es"))).length,
      ).toBeLessThanOrEqual(IMPORT_BATCH_BYTES);
      expect(batch[0]!.rowNumber).toBe(offset + 1);
      offset += batch.length;
      batches++;
    }
    expect(offset).toBe(600);
    expect(batches).toBeGreaterThan(3);
  });

  it("resumes from confirmed progress after a lost acknowledgement, including copy strategy", async () => {
    let persisted = { ...initial },
      first = true;
    const calls: string[] = [];
    const transfer: ImportTransferPort = async (request) => {
      calls.push(request.action);
      if (request.action === "begin" || request.action === "status")
        return { ok: true, job: persisted };
      if (request.action !== "append") throw new Error("Unexpected request");
      expect(request.offset).toBe(persisted.processedRows);
      persisted = {
        ...persisted,
        status: "completed",
        processedRows: 3,
        rowsCreated: 3,
        lastSourceRow: 3,
      };
      if (first) {
        first = false;
        throw new Error("Connection lost after commit");
      }
      return { ok: true, job: persisted };
    };
    await expect(
      runBrowserImport({
        descriptor,
        records,
        locale: "en",
        transfer,
        signal: signal(),
        onProgress: () => undefined,
      }),
    ).rejects.toThrow("Connection lost");
    const done = await runBrowserImport({
      descriptor,
      records,
      locale: "en",
      resumeJobId: id,
      transfer,
      signal: signal(),
      onProgress: () => undefined,
    });
    expect(done.rowsCreated).toBe(3);
    expect(calls).toEqual(["begin", "append", "status"]);
  });

  it("refuses another file or fabricated non-advancing response before sending more rows", async () => {
    const transfer = vi.fn<ImportTransferPort>(async () => ({
      ok: true,
      job: { ...initial, fileHash: "b".repeat(64) },
    }));
    await expect(
      runBrowserImport({
        descriptor,
        records,
        locale: "en",
        transfer,
        signal: signal(),
        onProgress: () => undefined,
      }),
    ).rejects.toMatchObject({ kind: "conflict" });
    expect(transfer).toHaveBeenCalledTimes(1);
    const unchanged: ImportTransferPort = async () => ({ ok: true, job: initial });
    await expect(
      runBrowserImport({
        descriptor,
        records,
        locale: "en",
        transfer: unchanged,
        signal: signal(),
        onProgress: () => undefined,
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("rejects malformed, unordered and oversized requests before repository access", async () => {
    const append = vi.fn<ImportTransferRepository["append"]>();
    const repository: ImportTransferRepository = {
      append,
      pending: vi.fn<ImportTransferRepository["pending"]>(),
      begin: vi.fn<ImportTransferRepository["begin"]>(),
      stop: vi.fn<ImportTransferRepository["stop"]>(),
      status: vi.fn<ImportTransferRepository["status"]>(),
      errors: vi.fn<ImportTransferRepository["errors"]>(),
      duplicates: vi.fn<ImportTransferRepository["duplicates"]>(),
    };
    expect(
      await transferImport(repository, {
        action: "append",
        jobId: id,
        offset: 0,
        locale: "en",
        records: [records[1], records[0]],
      }),
    ).toEqual({ ok: false, error: "invalid-input" });
    expect(
      await transferImport(repository, { action: "begin", ...descriptor, ownerId: id }),
    ).toEqual({ ok: false, error: "invalid-input" });
    expect(append).not.toHaveBeenCalled();
  });
});
