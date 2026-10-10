import { expect, test } from "@playwright/test";

test("search result metrics have their own full-width column without overlap", async ({ page }) => {
  await page.goto(`/?q=${encodeURIComponent("삼성전자")}`);
  const row = page.locator("a.result-row").first();
  await expect(row).toContainText("삼성전자(주)");
  for (const width of [1731, 1280, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const metrics = await row.locator(".result-metrics").boundingBox();
    expect(metrics!.width).toBeGreaterThan(width > 860 ? 400 : 250);
    const cells = await row.locator(".result-metrics > span").evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
          width: rect.width, overflow: element.scrollWidth > element.clientWidth };
      }));
    for (const cell of cells) {
      expect(cell.width).toBeGreaterThan(65);
      expect(cell.overflow).toBe(false);
    }
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i], b = cells[j];
        expect(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y).toBe(true);
      }
    }
    if (width > 860) {
      const arrow = await row.locator(".result-arrow").boundingBox();
      expect(arrow!.x).toBeGreaterThanOrEqual(metrics!.x + metrics!.width);
      expect((await row.boundingBox())!.height).toBeLessThan(180);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await row.screenshot({ path: `test-results/result-row-${width}.png` });
  }
});
