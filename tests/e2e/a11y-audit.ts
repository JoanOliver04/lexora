import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import { expect, type Page, type TestInfo } from "@playwright/test";

/** Traverse native Tab stops, including checked radio groups, without activating actions. */
async function auditKeyboard(page: Page, stage: string) {
  const expected = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        "a[href], button, input, textarea, select, summary, [tabindex]",
      ),
    ).filter(
      (node) =>
        node.tabIndex >= 0 &&
        node.getClientRects().length > 0 &&
        node.checkVisibility() &&
        !node.matches(":disabled") &&
        !node.closest("[inert]") &&
        getComputedStyle(node).visibility !== "hidden",
    );
    const stops = nodes.filter((node) => {
      if (!(node instanceof HTMLInputElement) || node.type !== "radio" || !node.name) return true;
      const group = nodes.filter(
        (other): other is HTMLInputElement =>
          other instanceof HTMLInputElement &&
          other.type === "radio" &&
          other.name === node.name &&
          other.form === node.form,
      );
      return node === (group.find((radio) => radio.checked) ?? group[0]);
    });
    stops.forEach((node, index) => node.setAttribute("data-lexora-focus-audit", String(index)));
    return stops.map((_, index) => String(index));
  });
  const seen = new Set<string>();
  let first: string | undefined;
  let previous: string | null | undefined;
  let completedCycle = false;
  try {
    for (let step = 0; step < expected.length * 3 + 8; step++) {
      await page.keyboard.press("Tab");
      const focus = await page.evaluate(() => {
        const node = document.activeElement;
        if (!(node instanceof HTMLElement)) return null;
        const id = node.getAttribute("data-lexora-focus-audit");
        const style = getComputedStyle(node);
        return { id, outline: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      if (!focus?.id) {
        previous = null;
        continue;
      }
      expect(focus.outline, `${stage}: visible keyboard focus`).not.toBe("none");
      expect(focus.width, `${stage}: focus indicator width`).toBeGreaterThanOrEqual(2);
      // Native date inputs have multiple internal Tab stops on the same element.
      if (focus.id === first && previous !== focus.id) {
        completedCycle = true;
        break;
      }
      first ??= focus.id;
      seen.add(focus.id);
      previous = focus.id;
    }
    expect([...seen].sort(), `${stage}: every native Tab stop is reachable`).toEqual(
      expected.sort(),
    );
    if (expected.length > 0)
      expect(completedCycle, `${stage}: Tab can leave every control`).toBe(true);
  } finally {
    await page
      .locator("[data-lexora-focus-audit]")
      .evaluateAll((nodes) =>
        nodes.forEach((node) => node.removeAttribute("data-lexora-focus-audit")),
      );
  }
}

export async function audit(page: Page, info: TestInfo, stage: string) {
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(async (value) => {
      document.documentElement.setAttribute("data-theme", value);
      await Promise.all(
        document
          .getAnimations()
          .filter((animation) =>
            Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
          )
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    }, theme);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const report = info.outputPath(`${stage}-${theme}-axe.json`);
    await writeFile(
      report,
      JSON.stringify({
        url: new URL(page.url()).pathname,
        theme,
        violations: result.violations,
        incomplete: result.incomplete,
      }),
    );
    await info.attach(`${stage}-${theme}-axe`, {
      path: report,
      contentType: "application/json",
    });
    expect.soft(result.violations, `${stage}/${theme}`).toEqual([]);
  }
  await auditKeyboard(page, stage);
}
