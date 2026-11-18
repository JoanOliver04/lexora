import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const master = readFileSync("assets/brand/logo-lexora.png");
const output = "public/icons/lexora-v2";
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const renders = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = `data:image/png;base64,${source}`;
    await image.decode();
    if (image.naturalWidth !== image.naturalHeight || image.naturalWidth < 512) {
      throw new Error("Expected a square master of at least 512 pixels");
    }

    function render(size, inset = 0) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      const extent = size - 2 * inset;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, inset, inset, extent, extent);

      if (inset > 0) {
        // Extend the blue edge pixels so the adaptive icon has an opaque border
        // without a hard color change around the original square.
        const rendered = ctx.getImageData(0, 0, size, size);
        const edge = size - inset - 1;
        const clamp = (position) => Math.min(edge, Math.max(inset, position));
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const sourceIndex = (clamp(y) * size + clamp(x)) * 4;
            const targetIndex = (y * size + x) * 4;
            if (sourceIndex !== targetIndex) {
              rendered.data.copyWithin(targetIndex, sourceIndex, sourceIndex + 4);
            }
          }
        }
        ctx.putImageData(rendered, 0, 0);
      }

      return canvas.toDataURL("image/png").split(",")[1];
    }

    return {
      icons: [16, 32, 48].map((size) => ({ size, png: render(size) })),
      files: {
        "brand-128.png": render(128),
        "apple-touch-icon.png": render(180),
        "icon-192.png": render(192),
        "icon-512.png": render(512),
        "maskable-512.png": render(512, 16),
      },
    };
  }, master.toString("base64"));

  mkdirSync(output, { recursive: true });
  for (const [name, png] of Object.entries(renders.files)) {
    writeFileSync(`${output}/${name}`, Buffer.from(png, "base64"));
  }

  const header = Buffer.alloc(6 + 16 * renders.icons.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(renders.icons.length, 4);
  let offset = header.length;
  const frames = renders.icons.map(({ size, png }, index) => {
    const frame = Buffer.from(png, "base64");
    const entry = 6 + index * 16;
    header[entry] = size;
    header[entry + 1] = size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
    return frame;
  });
  writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...frames]));
} finally {
  await browser.close();
}
