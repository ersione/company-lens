import { expect, test, type Page } from '@playwright/test';

async function hasTokenPixels(page: Page, token: string) {
  return page.locator('.history-chart canvas').evaluate((node: HTMLCanvasElement, key) => {
    const hex = getComputedStyle(node).getPropertyValue(`--${key}`).trim();
    const expected = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16));
    const data = node.getContext('2d')!.getImageData(0, 0, node.width, node.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 200 && expected.every((value, index) => Math.abs(data[i + index] - value) <= 3)) count++;
    }
    return count > 10;
  }, token);
}

test('shared highlights and chart lines use the same semantic palette', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/companies/4270');
  await expect(page.locator('.header-navigation')).toHaveClass(/eds-navigation/);
  await expect(page.locator('.header-navigation [aria-current="page"]')).toHaveText('회사 검색');
  await expect(page.locator('.employment-summary')).toHaveClass(/eds-highlight-panel/);
  for (const tone of ['people', 'salary', 'joiners', 'departures']) {
    const highlight = page.locator(`.employment-summary .eds-highlight[data-metric="${tone}"]`).first();
    await expect(highlight).toBeVisible();
    expect(await highlight.evaluate((node, key) => {
      const color = getComputedStyle(node.querySelector("span")!).color;
      const hex = getComputedStyle(node).getPropertyValue(`--data-${key}`).trim();
      const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16));
      return color === `rgb(${rgb.join(', ')})`;
    }, tone)).toBe(true);
  }
  for (const tone of ['blue','teal','gray']) {
    const panel=page.locator(`.employment-summary .eds-data-panel.eds-data--${tone}`).first();
    await expect(panel).toBeVisible();
    expect(await panel.evaluate((node,color)=>{
      const style=getComputedStyle(node);
      const rgb=style.getPropertyValue(`--palette-${color}-subtle`).trim().slice(1).match(/../g)!.map(value=>parseInt(value,16));
      return style.backgroundColor===`rgb(${rgb.join(', ')})`;
    },tone)).toBe(true);
  }
  await expect(page.locator('.annual-movement .eds-data-badge')).toHaveCount(2);
  const movementColors = await page.locator('.movement-breakdown dd').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
  const summaryColors = await page.locator('.annual-movement .eds-highlight').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).color));
  expect(movementColors).toEqual(summaryColors);
  await expect(page.locator('.history-chart')).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => hasTokenPixels(page, 'data-people')).toBe(true);
  await page.getByRole('button', { name: '취득·상실', exact: true }).click();
  await expect.poll(() => hasTokenPixels(page, 'data-joiners')).toBe(true);
  await expect.poll(() => hasTokenPixels(page, 'data-departures')).toBe(true);
  await page.getByRole('button', { name: '추정 평균 연봉', exact: true }).click();
  await expect.poll(() => hasTokenPixels(page, 'data-salary')).toBe(true);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.employment-summary').screenshot({ path: `test-results/data-highlights-${width}.png` });
  }
  expect(errors).toEqual([]);
});
