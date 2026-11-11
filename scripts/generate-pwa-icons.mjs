import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";

// Render our vector source with the existing test browser; no image service.
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const svg = readFileSync("public/icons/lexora.svg", "utf8");
  for (const size of [32, 180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<style>html,body{margin:0;width:100%;height:100%}svg{display:block;width:100%;height:100%;border-radius:${size === 32 ? "20%" : "0"}}</style>${svg}`,
    );
    await page.screenshot({ path: `public/icons/icon-${size}.png`, omitBackground: size === 32 });
  }
  copyFileSync("public/icons/icon-512.png", "public/icons/maskable-512.png");
  copyFileSync("public/icons/icon-180.png", "public/icons/apple-touch-icon.png");
  const png = readFileSync("public/icons/icon-32.png"),
    header = Buffer.alloc(22);
  if (png[25] !== 6) throw new Error("ICO requires an RGBA PNG");
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = 32;
  header[7] = 32;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18);
  writeFileSync("src/app/favicon.ico", Buffer.concat([header, png]));
} finally {
  await browser.close();
}
