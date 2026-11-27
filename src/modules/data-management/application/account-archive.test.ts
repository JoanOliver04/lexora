// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  blobHash,
  packArchive,
  prepareArchive,
  type ArchiveManifest,
  type ArchivePage,
} from "./account-archive";

const owner = "42c00000-0000-4000-8000-000000000001",
  course = "42c00000-0000-4000-8000-000000000002";
async function page(entity: ArchivePage["entity"], body: string, rows: number) {
  const blob = new Blob([body]);
  return {
    blob,
    spec: { entity, after: null, rows, bytes: blob.size, sha256: await blobHash(blob) },
  };
}
async function fixture() {
  const audio = new Blob([new Uint8Array([0, 255, 33, 45, 64])], { type: "audio/wav" });
  const hash = await blobHash(audio);
  const entries = await Promise.all([
    page("profiles", JSON.stringify([{ id: owner }]), 1),
    page(
      "courses",
      '[{"id":"' +
        course +
        '","owner_id":"' +
        owner +
        '","eoi_sources":{"s":{"audio":"model.wav","hash":"' +
        hash +
        '"}},"metadata":{"n":9007199254740993}}]',
      1,
    ),
  ]);
  const manifest: ArchiveManifest = {
    format: "lexora-account-archive/1",
    owner,
    exportedAtUtc: "2026-11-27T00:00:00Z",
    pages: entries.map((e) => e.spec),
    audio: [{ course, hash, bytes: audio.size, type: "audio/wav" }],
  };
  return { manifest, parts: entries.map((e) => e.blob), audio };
}
describe("complete account archive", () => {
  it("preserves raw JSON numbers and media bytes in a self-contained file", async () => {
    const { manifest, parts, audio } = await fixture(),
      file = await packArchive(manifest, parts, [audio]);
    const parsed = await prepareArchive(file, owner);
    expect(parsed.counts.profiles).toBe(1);
    expect(await parsed.pages[1]!.text()).toContain("9007199254740993");
    expect(await blobHash(parsed.audio[0]!)).toBe(manifest.audio[0]!.hash);
    expect(parsed.audio[0]!.type).toBe("audio/wav");
    await expect(prepareArchive(file, course)).rejects.toMatchObject({ kind: "wrongAccount" });
  });
  it("rejects corrupt, missing, trailing or unreferenced audio before restoring", async () => {
    const { manifest, parts, audio } = await fixture();
    for (const file of [
      await packArchive(manifest, parts, [new Blob(["other"])]),
      await packArchive({ ...manifest, audio: [] }, parts, []),
      new Blob([await packArchive(manifest, parts, [audio]), "extra"]),
      await packArchive({ ...manifest, audio: [{ ...manifest.audio[0]!, course: owner }] }, parts, [
        audio,
      ]),
    ])
      await expect(prepareArchive(file, owner)).rejects.toBeDefined();
  });
  it("verifies all pages of an actual file larger than 16 MiB and 50,000 rows", async () => {
    const base = await page("profiles", JSON.stringify([{ id: owner }]), 1);
    const pages = [base.spec],
      parts = [base.blob];
    let count = 0;
    for (let i = 0; i < 196; i++) {
      const rows = Array.from({ length: 256 }, () => ({
        owner_id: owner,
        id: ++count,
        label: "synthetic data ".repeat(20),
      }));
      const p = await page("tags", JSON.stringify(rows), rows.length);
      pages.push(p.spec);
      parts.push(p.blob);
    }
    const manifest: ArchiveManifest = {
      format: "lexora-account-archive/1",
      owner,
      exportedAtUtc: "2026-11-27T00:00:00Z",
      pages,
      audio: [],
    };
    const download = await packArchive(manifest, parts, []);
    expect(download.size).toBeGreaterThan(16777216);
    const result = await prepareArchive(download, owner);
    expect(result.counts.tags).toBe(50176);
    expect(result.pages.length).toBe(197);
  });
});
