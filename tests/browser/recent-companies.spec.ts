import { expect, test } from "@playwright/test";
import { recentCompaniesKey } from "../../lib/recent-companies";

test('visits persist only in the browser, reorder, synchronize tabs and can be removed', async ({ page, context, browser, request }) => {
  const posts: string[] = [];
  page.on('request', r => {
    if (r.method() !== 'POST') return;
    const body = r.postData() ?? '';
    // Public Cloudflare RUM already emits beacons; visit storage must not be in them.
    expect(body).not.toContain(recentCompaniesKey);
    expect(body).not.toContain('"visitedAt"');
    if (new URL(r.url()).pathname !== '/cdn-cgi/rum') posts.push(r.url());
  });
  await page.goto('/');
  await expect(page.locator('.recent-companies')).toHaveCount(0);
  await expect(page.locator('.example-searches')).toHaveCount(0);
  for (const id of [177744,4270,177744]) {
    await page.goto(`/companies/${id}`);
    await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? '[]')[0]?.id, recentCompaniesKey)).toBe(id);
  }
  await page.locator('.brand').click();
  await expect(page.locator('.recent-companies li')).toHaveCount(2);
  await expect(page.locator('.recent-companies a').first()).toHaveAttribute('href', '/companies/177744');
  await page.reload();
  await expect(page.locator('.recent-companies li')).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.recent-companies').screenshot({ path: 'test-results/recent-visits-normal-390.png' });
  expect(await (await request.get('/')).text()).not.toContain('id="recent-companies-heading"');
  const isolated = await browser.newContext();
  try {
    const other = await isolated.newPage();
    await other.goto(new URL('/', page.url()).href);
    await expect(other.locator('.recent-companies')).toHaveCount(0);
  } finally { await isolated.close(); }
  const tab = await context.newPage();
  await tab.goto('/');
  await expect(tab.locator('.recent-companies li')).toHaveCount(2);
  await page.getByRole('button', { name: '삼성전자(주) 방문 기록 삭제', exact: true }).click();
  await expect(tab.locator('.recent-companies li')).toHaveCount(1);
  await page.getByRole('button', { name: '최근 방문 사업장 전체 지우기' }).click();
  await expect(page.locator('.recent-companies')).toHaveCount(0);
  await expect(tab.locator('.recent-companies')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.recent-companies')).toHaveCount(0);
  await tab.close();
  expect(posts).toEqual([]);
});

test('expired and malformed records are pruned and long names fit mobile layouts', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(key => localStorage.setItem(key, JSON.stringify([
    { id: 177744, name: '기간 지난 사업장', visitedAt: Date.now() - 31 * 86400000 },
    ...Array.from({ length: 6 }, (_, i) => ({ id: i + 1, name: `긴사업장명${i}`.repeat(10), visitedAt: Date.now() - i }))
  ])), recentCompaniesKey);
  await page.reload();
  await expect(page.locator('.recent-companies li')).toHaveCount(5);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), recentCompaniesKey)).not.toContain('기간 지난 사업장');
  for (const width of [1280,390,320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.recent-companies').screenshot({ path: `test-results/recent-visits-${width}.png` });
  }
  await page.evaluate(key => localStorage.setItem(key, '{broken'), recentCompaniesKey);
  await page.reload();
  await expect(page.locator('.recent-companies')).toHaveCount(0);
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), recentCompaniesKey)).toBeNull();
});

test('disabled browser storage does not break detail or home', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    for (const method of ['getItem','setItem','removeItem']) Object.defineProperty(Storage.prototype, method, {
      value: () => { throw new DOMException('blocked', 'SecurityError'); }
    });
  });
  await page.goto('/companies/177744');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('나이키코리아');
  await page.locator('.brand').click();
  await expect(page.getByRole('heading', { name: '숫자로 보는 회사', exact: true })).toBeVisible();
  await expect(page.locator('.recent-companies')).toHaveCount(0);
  expect(errors).toEqual([]);
});
