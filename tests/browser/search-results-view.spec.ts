import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
  test(`search switches from overview to above-the-fold results at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '숫자로 보는 회사', exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '공개 데이터 통계' })).toBeVisible();
    await page.getByRole('textbox', { name: '회사 검색' }).fill('삼성전자');
    await page.getByRole('button', { name: '검색', exact: true }).click();
    await expect(page.locator('#search-results-title')).toHaveText('삼성전자 검색 결과');
    await expect(page.locator('.search-heading')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '예시 검색어' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '공개 데이터 통계' })).toHaveCount(0);
    await expect(page.locator('.result-total')).toHaveText(/총\s+[\d,]+개/);
    await expect(page.locator('.result-source-note')).toContainText('국민연금 기반 추정치');
    const first = await page.locator('a.result-row').first().boundingBox();
    expect(first).not.toBeNull();
    expect(first!.y).toBeGreaterThan(0);
    expect(first!.y + 50).toBeLessThan(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/search-results-view-${viewport.width}.png` });
    await page.locator('.brand').click();
    await expect(page.getByRole('heading', { name: '숫자로 보는 회사', exact: true })).toBeVisible();
    await expect(page.locator('.search-results-view')).toHaveCount(0);
  });
}

test('empty, invalid and long searches keep a compact accessible layout', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const query = '없는회사검색어'.repeat(12);
  await page.goto(`/?q=${encodeURIComponent(query)}`);
  await expect(page.locator('#search-results-title .result-query')).toHaveText(query);
  await expect(page.locator('.result-total')).toContainText('0');
  await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/search-long-query-320.png' });
  await page.goto('/?q=a');
  await expect(page.locator('#search-error')).toBeVisible();
  await expect(page.locator('.search-error-heading')).toBeVisible();
  await expect(page.locator('.search-heading')).toHaveCount(0);
  await expect(page.locator('.example-searches')).toHaveCount(0);
});
