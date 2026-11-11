import { afterEach, describe, expect, it, vi } from "vitest";
import { readBrowserImportFile, transferBrowserImport } from "./browser-import";

afterEach(() => vi.unstubAllGlobals());
describe("browser import file and transport boundaries", () => {
  it("counts data rows after directives and bounds excessive rows and columns", async () => {
    const content = "#separator:tab\n#html:true\n" + "front\tback\ttag\n".repeat(10000);
    const result = await readBrowserImportFile(new File([content], "synthetic.tsv"));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("File rejected");
    expect(result.carried.rawRows).toHaveLength(10000);
    expect(
      await readBrowserImportFile(new File([content + "front\tback\ttag\n"], "synthetic.tsv")),
    ).toMatchObject({ ok: false, error: "too-many-rows" });
    expect(
      await readBrowserImportFile(
        new File([Array(202).fill("column").join("\t")], "synthetic.tsv"),
      ),
    ).toMatchObject({ ok: false, error: "too-many-columns" });
  });
  it("rejects oversized files before allocation and malformed UTF-8 before parsing", async () => {
    const file = new File(["a".repeat(5 * 1024 * 1024 + 1)], "synthetic.txt");
    const read = vi.spyOn(file, "arrayBuffer");
    expect(await readBrowserImportFile(file)).toMatchObject({ ok: false, error: "too-large" });
    expect(read).not.toHaveBeenCalled();
    expect(
      await readBrowserImportFile(new File([new Uint8Array([0xc3, 0x28])], "synthetic.txt")),
    ).toMatchObject({ ok: false, error: "read-failed" });
  });

  it("reads a near-5MB file locally and hashes original bytes without posting its ignored column", async () => {
    const file = new File(
      ["front\tback\ttag\t", "x".repeat(5 * 1024 * 1024 - 100)],
      "synthetic.tsv",
    );
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await readBrowserImportFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("File rejected");
    expect(result.carried.originalBytes).toBe(file.size);
    expect(result.carried.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.carried.columnCount).toBe(4);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects oversized or malformed responses and preserves typed API failures", async () => {
    const request = { action: "status" as const, jobId: "10000000-0000-4000-8000-000000000001" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: false, error: "conflict" }, { status: 409 })),
    );
    expect(await transferBrowserImport(request)).toEqual({ ok: false, error: "conflict" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x".repeat(1024 * 1024 + 1))),
    );
    await expect(transferBrowserImport(request)).rejects.toMatchObject({ kind: "unavailable" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, job: { processedRows: -1 } })),
    );
    await expect(transferBrowserImport(request)).rejects.toMatchObject({ kind: "unavailable" });
  });
});
