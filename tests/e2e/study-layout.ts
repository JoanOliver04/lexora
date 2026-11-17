import { expect, type Page, type TestInfo } from "@playwright/test";

/** Layout proof only: root text scaling is not native browser zoom or a physical device. */
export async function assertStudyLayout(page: Page, info: TestInfo, stage: string) {
  const originalViewport = page.viewportSize();
  if (!originalViewport) throw new Error("Study layout requires an explicit viewport");
  const original = await page.evaluate(() => ({
    fontSize: document.documentElement.style.fontSize,
    theme: document.documentElement.getAttribute("data-theme"),
  }));
  try {
    for (const variant of [
      { name: "baseline", width: originalViewport.width, scale: "100%", dark: false },
      { name: "text-200", width: originalViewport.width, scale: "200%", dark: true },
      { name: "narrow-320", width: 320, scale: "100%", dark: true },
      { name: "narrow-320-text-200", width: 320, scale: "200%", dark: true },
    ]) {
      await page.setViewportSize({ width: variant.width, height: originalViewport.height });
      await page.evaluate(({ scale, dark }) => {
        document.documentElement.style.fontSize = scale;
        document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
      }, variant);
      const label = `${stage}-${variant.name}`;
      try {
        const geometry = await page.evaluate(() => {
          const overlaps: string[] = [];
          for (const term of document.querySelectorAll("main dl dt")) {
            const value = term.nextElementSibling;
            if (!value || value.tagName !== "DD") continue;
            const termRange = document.createRange();
            termRange.selectNodeContents(term);
            const valueRange = document.createRange();
            valueRange.selectNodeContents(value);
            for (const left of termRange.getClientRects()) {
              for (const right of valueRange.getClientRects()) {
                if (
                  left.right > right.left - 4 &&
                  left.left < right.right &&
                  left.top < right.bottom - 1 &&
                  left.bottom > right.top + 1
                )
                  overlaps.push(term.textContent ?? "empty term");
              }
            }
          }
          return {
            viewport: innerWidth,
            width: document.documentElement.scrollWidth,
            overlaps,
            targets: [...document.querySelectorAll("main button, main a")]
              .filter((node) => node.getClientRects().length > 0)
              .map((node) => ({
                label: node.textContent,
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height,
              })),
          };
        });
        // Mobile browsers can expand innerWidth to fit overflowing content.
        // The requested viewport is the contract, not that expanded value.
        expect(geometry.width, `${label}: horizontal overflow`).toBeLessThanOrEqual(
          variant.width + 1,
        );
        expect(geometry.overlaps, `${label}: terms collide with their values`).toEqual([]);
        for (const target of geometry.targets) {
          expect(target.height, `${label}: ${target.label} height`).toBeGreaterThanOrEqual(44);
          expect(target.width, `${label}: ${target.label} width`).toBeGreaterThanOrEqual(44);
        }
        if (variant.name === "narrow-320-text-200")
          await page.screenshot({
            path: info.outputPath(`${label}.png`),
            fullPage: true,
            animations: "disabled",
          });
      } catch (error) {
        await page.screenshot({
          path: info.outputPath(`${label}-failure.png`),
          fullPage: true,
          animations: "disabled",
        });
        throw error;
      }
    }
  } finally {
    await page.setViewportSize(originalViewport);
    await page.evaluate(({ fontSize, theme }) => {
      document.documentElement.style.fontSize = fontSize;
      if (theme === null) document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", theme);
    }, original);
  }
}
