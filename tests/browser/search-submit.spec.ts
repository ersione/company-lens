import { expect, test } from '@playwright/test';

test('empty-query filters remain drafts until explicit submission', async ({ page }) => {
  await page.goto('/');
  const original = page.url();
  const navigations: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname === '/' && url.searchParams.has('q') && (request.isNavigationRequest() || request.headers()['rsc'])) navigations.push(request.url());
  });
  await page.getByRole('combobox', { name: '지역', exact: true }).selectOption('부산광역시');
  await page.getByRole('combobox', { name: '가입자 규모' }).selectOption('50');
  await page.getByRole('combobox', { name: '정렬', exact: true }).selectOption('relevance');
  await page.getByRole('checkbox', { name: '과거 사업장 포함' }).check();
  await expect(page.getByRole('button', { name: '검색', exact: true })).toHaveAttribute('aria-busy', 'false');
  await expect(page).toHaveURL(original);
  expect(navigations).toEqual([]);
  await page.getByRole('textbox', { name: '회사 검색', exact: true }).fill('삼성전자');
  await page.getByRole('textbox', { name: '회사 검색', exact: true }).press('Enter');
  await expect(page).toHaveURL(/minEmployees=50/);
  expect(new URL(page.url()).searchParams.get('region')).toBe('부산광역시');
  expect(new URL(page.url()).searchParams.get('includeHistory')).toBe('true');
});

for (const width of [1280, 390, 320]) {
  test(`search button stays fixed during a pending request at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const button = page.getByRole('button', { name: '검색', exact: true });
    const before = await button.boundingBox();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(url => url.pathname === '/' && url.searchParams.get('q') === '국민은행', async route => {
      await gate;
      await route.continue();
    });
    try {
      await page.getByRole('textbox', { name: '회사 검색', exact: true }).fill('국민은행');
      await button.click();
      await expect(button).toHaveAttribute('aria-busy', 'true');
      await expect(button).toContainText('검색 중');
      const during = await button.boundingBox();
      expect(during!.width).toBe(before!.width);
      expect(during!.height).toBe(before!.height);
      expect(await button.locator('span').evaluate(el => el.getBoundingClientRect().height <= parseFloat(getComputedStyle(el).lineHeight) + 1)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/search-pending-${width}.png` });
    } finally {
      release();
    }
    await expect(page).toHaveURL(/q=/);
    await expect(button).toHaveAttribute('aria-busy', 'false');
  });
}

test('header identifies the current section on direct and nested routes', async ({ page }) => {
  for (const [path, label] of [
    ['/statistics', '고용 동향'], ['/employment-trends', '고용 변화'],
    ['/industries', '업종별'], ['/regions', '지역별'], ['/companies/33448909', '회사 검색']
  ]) {
    await page.goto(path);
    const active = page.getByRole('navigation', { name: '주 메뉴' }).locator('[aria-current="page"]');
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(label);
    await expect(active.locator('svg')).toHaveCount(1);
  }
  await page.goto('/regions');
  const detail = page.locator('main a[href^="/regions/"]').first();
  await detail.click();
  await expect(page.getByRole('navigation', { name: '주 메뉴' }).locator('[aria-current="page"]')).toHaveText('지역별');
});
