import { expect, test } from "@playwright/test";

test("comparison empty state and source note do not overlap", async ({ page }) => {
  await page.goto("/compare");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    const empty = await page.locator(".compare-page .empty-state").boundingBox();
    const note = await page.locator(".compare-page > .detail-caveat").boundingBox();
    expect(empty).not.toBeNull();
    expect(note).not.toBeNull();
    expect(note!.y - (empty!.y + empty!.height)).toBeGreaterThanOrEqual(17);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/compare-empty-${width}.png`, fullPage: true });
  }
});

test("public statistics expose precomputed history, interactive charts and annual coverage", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/statistics");
  await expect(page.getByRole("heading", { name: "월간 고용 동향", exact: true })).toBeVisible();
  await expect(page.locator(".statistics-canvas[data-ready=true]")).toBeVisible();
  for (const label of ["추정 평균 연봉", "취득·상실", "사업장 수", "가입자 수"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page.locator(".statistics-canvas[data-ready=true]")).toBeVisible();
    await expect(page.getByRole("img", { name: `${label} 월별 통계 추이` })).toBeVisible();
  }
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(page.getByRole("button", { name: "전체", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "연간 고용 요약" })).toBeVisible();
  await expect(page.locator(".statistics-year-coverage").filter({ hasText: "부분 집계" }).first()).toBeVisible();
  const coloredPixels = await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 100 && data[i + 1] > data[i] * 1.3 && data[i + 1] > 50) count++;
    return count;
  });
  expect(coloredPixels).toBeGreaterThan(100);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".statistics-ranking .statistics-footnote")).toHaveCSS("font-size", "12px");
    await expect(page.locator(".statistics-ranking .statistics-footnote")).toHaveCSS("text-align", "right");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/statistics-overview-${width}.png` });
    await page.locator(".statistics-ranking").screenshot({ path: `test-results/statistics-ranking-${width}.png` });
  }
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/statistics</loc>");
  expect(xml).toContain("/industries/");
  expect(xml).toContain("/regions/");
  expect(xml).not.toContain("/companies/");
  expect(xml).not.toContain("/admin");
  expect((await request.get("/regions/not-a-region")).status()).toBe(404);
  expect(errors).toEqual([]);
});

test("industry and region navigation, metadata and responsive layouts work", async ({ page }) => {
  await page.goto("/industries");
  await expect(page.getByRole("heading", { name: "업종별 현황", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "공개 통계" })).toHaveCount(0);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/statistics-industries-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 1000 });
  const pager = page.getByRole("navigation", { name: "업종 현황 페이지" });
  if (await pager.count()) {
    await pager.getByRole("link", { name: "다음", exact: true }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.locator(".statistics-table tbody tr")).toHaveCount(30);
    await pager.getByRole("link", { name: "이전", exact: true }).click();
    await expect(pager.locator('[aria-current="page"]')).toHaveText("1");
  }
  await page.locator(".statistics-table tbody th a").first().click();
  await expect(page.locator(".statistics-canvas[data-ready=true]")).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /companylens\.ersione\.com\/industries\//);
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "지역별", exact: true }).click();
  await page.getByLabel("지역 선택").selectOption("경기도");
  await expect(page.getByRole("heading", { name: "경기도", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "공개 통계" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "주 메뉴" }).locator("[aria-current=page]")).toHaveText("지역별");
  await expect(page.locator(".statistics-region-note")).toContainText("과거 시점의 소재지");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".statistics-canvas[data-ready=true]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/statistics-region-${width}.png`, fullPage: true });
  }
  await page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link", { name: "회사 검색" }).click();
  await expect(page.getByRole("heading", { name: "숫자로 보는 회사", exact: true })).toBeVisible();
});
