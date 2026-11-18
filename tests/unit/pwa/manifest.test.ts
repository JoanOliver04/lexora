import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

function expectPngSize(png: Buffer, size: number) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  expect(png.readUInt32BE(16)).toBe(size);
  expect(png.readUInt32BE(20)).toBe(size);
}

describe("Installable application assets", () => {
  it("ships each declared PNG at its real size with a maskable icon", () => {
    const result = manifest();
    expect(result).toMatchObject({ id: "/", scope: "/", start_url: "/app", display: "standalone" });
    expect(result.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of result.icons!) {
      const png = readFileSync(`public${icon.src}`),
        size = Number(icon.sizes!.split("x")[0]);
      expectPngSize(png, size);
    }
    expectPngSize(readFileSync("public/icons/lexora-v2/apple-touch-icon.png"), 180);
  });

  it("packs all three browser favicon sizes into one ICO", () => {
    const favicon = readFileSync("src/app/favicon.ico");
    expect(favicon.readUInt16LE(0)).toBe(0);
    expect(favicon.readUInt16LE(2)).toBe(1);
    expect(favicon.readUInt16LE(4)).toBe(3);
    let nextOffset = 6 + 16 * 3;
    for (const [index, size] of [16, 32, 48].entries()) {
      const entry = 6 + 16 * index;
      expect(favicon[entry]).toBe(size);
      expect(favicon[entry + 1]).toBe(size);
      const length = favicon.readUInt32LE(entry + 8);
      const offset = favicon.readUInt32LE(entry + 12);
      expect(offset).toBe(nextOffset);
      expectPngSize(favicon.subarray(offset, offset + length), size);
      nextOffset += length;
    }
    expect(nextOffset).toBe(favicon.length);
  });
});
