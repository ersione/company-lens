import { expect, test } from "@playwright/test";

test("company detail prioritizes metrics and source without exposing raw filenames", async ({ page }) => {
  await page.goto("/companies/177744");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("유한회사 나이키코리아");
  await expect(page.locator(".detail-metric")).toHaveCount(3);
  await expect(page.locator(".detail-source")).toContainText("국민연금공단");
  await expect(page.locator(".benchmark-item")).toHaveCount(2);
  await expect(page.locator(".size-benchmark .benchmark-value")).toContainText(/상위\d+(?:\.\d+)?%/);
  await expect(page.locator(".salary-benchmark .benchmark-value")).toContainText(/상위\d+(?:\.\d+)?%/);
  await expect(page.getByText("원본 파일", { exact: true })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/\.csv(?:\.gz)?/);
  await expect(page.locator(".history-chart")).toHaveAttribute("data-ready", "true");
  for (const width of [1731, 1280, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const boxes = await page.locator(".detail-metric").evaluateAll((elements) => elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, fits: element.scrollWidth <= element.clientWidth };
    }));
    expect(boxes.every(({ fits }) => fits)).toBe(true);
    expect(await page.locator(".benchmark-item").evaluateAll((elements) => elements.every((element) => element.scrollWidth <= element.clientWidth))).toBe(true);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
    }
    await page.screenshot({ path: `test-results/company-detail-${width}.png`, fullPage: true });
  }
  const notes = page.locator(".calculation-note details");
  await expect(notes).not.toHaveAttribute("open");
  await notes.locator("summary").click();
  await expect(notes).toHaveAttribute("open", "");
  await expect(notes).toContainText("9.5%");
  await page.getByText(/월별 원자료 ·/).click();
  await expect(page.locator(".history-table tbody tr").first()).toBeVisible();
});
