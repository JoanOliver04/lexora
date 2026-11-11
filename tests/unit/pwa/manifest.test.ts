import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
describe("Installable application assets", () => {
  it("ships each declared PNG at its real size with a maskable icon", () => {
    const result = manifest();
    expect(result).toMatchObject({ id: "/", scope: "/", start_url: "/app", display: "standalone" });
    expect(result.icons?.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of result.icons!) {
      const png = readFileSync(`public${icon.src}`),
        size = Number(icon.sizes!.split("x")[0]);
      expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    }
    const apple = readFileSync("public/icons/apple-touch-icon.png");
    expect(apple.readUInt32BE(16)).toBe(180);
    const favicon = readFileSync("src/app/favicon.ico");
    expect(favicon.readUInt16LE(2)).toBe(1);
    expect(favicon.readUInt32LE(18)).toBe(22);
    expect(favicon[22 + 25]).toBe(6);
  });
});
