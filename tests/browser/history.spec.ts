import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`history chart and statistics render at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("header")).toHaveCount(1);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "공개 데이터 통계" })).toBeVisible();
    const input = await page.getByRole("textbox", { name: "회사 검색" }).boundingBox();
    const button = await page.getByRole("button", { name: "검색", exact: true }).boundingBox();
    expect(input).not.toBeNull();
    expect(button).not.toBeNull();
    expect(input!.x + input!.width).toBeLessThanOrEqual(button!.x);
    expect(Math.abs(input!.y - button!.y)).toBeLessThan(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/overview-${viewport.width}.png` });
    await page.goto("/companies/4270");
    await expect(page.locator(".history-chart")).toHaveAttribute("data-ready", "true");
    const pixels = await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
      const bytes = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0;
      for (let i = 0; i < bytes.length; i += 4) {
        if (bytes[i + 3] > 0 && bytes[i + 2] > bytes[i] + 20 && bytes[i + 2] > bytes[i + 1]) colored++;
      }
      return colored;
    });
    expect(pixels).toBeGreaterThan(20);
    await page.locator(".history-chart-section").screenshot({ path: `test-results/history-${viewport.width}.png` });
    await page.getByRole("button", { name: "취득·상실", exact: true }).click();
    await expect(page.getByRole("img", { name: "취득·상실 월별 추이" })).toBeVisible();
    await page.getByRole("button", { name: "추정 평균 연봉", exact: true }).click();
    await expect(page.getByRole("img", { name: "추정 평균 연봉 월별 추이" })).toBeVisible();
    await page.getByRole("button", { name: "1년", exact: true }).click();
    await expect(page.getByRole("button", { name: "1년", exact: true })).toHaveAttribute("aria-pressed", "true");
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits).toBe(true);
    await page.getByText(/월별 원자료 ·/).click();
    await expect(page.locator(".history-table tbody tr").first()).toBeVisible();
  });
}

test("recent visit shortcuts reopen the actual company detail", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/companies/177744");
  await expect.poll(() => page.evaluate(() => localStorage.getItem('company-lens:recent-companies:v1'))).not.toBeNull();
  await page.goto("/");
  await page.getByRole("textbox", { name: "회사 검색" }).fill("수정한 검색어");
  await page.locator('.recent-companies a[href="/companies/177744"]').click();
  await expect(page).toHaveURL(/\/companies\/177744$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('나이키코리아');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/search-mobile.png", fullPage: true });
});
