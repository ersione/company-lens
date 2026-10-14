import { expect, test } from "@playwright/test";
import { isDailyWorkerWorkplace } from "../../lib/daily-worker";

test("recent single-month zero workplaces are omitted without deleting detail or history", async ({ page, request }) => {
  const query = encodeURIComponent('신영인사이트');
  const response = await request.get(`/api/v1/companies?q=${query}`);
  expect(response.status()).toBe(200);
  expect((await response.json()).data.companies.map((row: { id: number }) => row.id)).not.toContain(3);
  await page.goto(`/?q=${query}`);
  await expect(page.locator('a[href="/companies/3"]')).toHaveCount(0);
  const detail = await request.get('/api/v1/companies/3');
  expect(detail.status()).toBe(200);
  expect((await detail.json()).data.employeeCount).toBe(0);
  const history = await request.get('/api/v1/companies/3/history');
  expect(history.status()).toBe(200);
  expect((await history.json()).data.snapshots).toEqual([
    expect.objectContaining({ snapshotMonth: '2026-08', employeeCount: 0 })
  ]);
});

test("daily-worker records and complete histories are removed while Samsung headquarters remains", async ({ page, request }) => {
  const query = encodeURIComponent('삼성전자로지텍');
  const response = await request.get(`/api/v1/companies?q=${query}&limit=20`);
  expect(response.status()).toBe(200);
  const rows = (await response.json()).data.companies as { id: number; name: string; employeeCount: number | null }[];
  expect(rows.some((row) => row.id === 130217)).toBe(true);
  expect(rows.some((row) => isDailyWorkerWorkplace(row.name))).toBe(false);
  expect(rows.map((row) => row.id)).not.toContain(62114128);
  await page.goto(`/?q=${query}`);
  await expect(page.locator('a[href="/companies/62114128"]')).toHaveCount(0);
  await expect(page.locator('a[href="/companies/130217"]')).toBeVisible();
  for (const id of [62114128,41903075,590112,43903861]) {
    expect((await request.get(`/api/v1/companies/${id}`)).status()).toBe(404);
    expect((await request.get(`/api/v1/companies/${id}/history`)).status()).toBe(404);
  }
  const english = await request.get('/api/v1/companies?q=tving');
  expect(english.status()).toBe(200);
  expect((await english.json()).data.totalCount).toBe(0);
});

test("old explicitly daily-worker construction records are removed from search and detail", async ({ page, request }) => {
  const response = await request.get(`/api/v1/companies?q=${encodeURIComponent("NIKEGANGNAMRemoeling")}&limit=20`);
  expect(response.status()).toBe(200);
  expect((await response.json()).data.companies.map((row: { id: number }) => row.id)).not.toContain(12261967);
  await page.goto(`/?q=${encodeURIComponent("NIKEGANGNAMRemoeling")}`);
  await expect(page.locator('a[href="/companies/12261967"]')).toHaveCount(0);
  const detail = await request.get("/api/v1/companies/12261967");
  expect(detail.status()).toBe(404);
  expect((await request.get('/api/v1/companies/12261967/history')).status()).toBe(404);
  expect((await page.goto("/companies/12261967"))?.status()).toBe(404);
});

test("adjacent record candidates link both ways without stitching histories", async ({ page, request }) => {
  for (const [id, otherId, direction, firstMonth] of [
    [128813, 888149, "earlier", "2020-05"], [888149, 128813, "later", "2015-11"]
  ] as const) {
    const response = await request.get(`/api/v1/companies/${id}/insights`);
    expect(response.status()).toBe(200);
    expect((await response.json()).data.recordCandidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: otherId, direction })
    ]));
    const history = await request.get(`/api/v1/companies/${id}/history`);
    expect((await history.json()).data.snapshots[0].snapshotMonth).toBe(firstMonth);
    await page.goto(`/companies/${id}`);
    await expect(page.locator(`.record-candidates a[href='/companies/${otherId}']`)).toBeVisible();
    await expect(page.locator(".record-candidates")).toContainText("확정된 것은 아닙니다");
    for (const width of [1280, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator(".record-candidates").screenshot({ path: `test-results/record-candidates-${id}-${width}.png` });
    }
    await page.locator(`.record-candidates a[href='/companies/${otherId}']`).click();
    await expect(page).toHaveURL(new RegExp(`/companies/${otherId}$`));
  }
});

test("detail exposes employment summaries, industry medians and safe name candidates", async ({ page, request }) => {
  await page.goto("/companies/177744");
  await expect(page.getByRole("heading", { name: "최근 고용 흐름" })).toBeVisible();
  await expect(page.locator(".employment-summary")).toContainText("1년 전 대비 가입자");
  await expect(page.locator(".peer-median")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "같은 업종·비슷한 규모와 비교" })).toBeVisible();
  await expect(page.locator(".three-year-summary")).toContainText("3년 전 대비 가입자");
  await expect(page.locator(".annual-movement")).toContainText("최근 12개월 취득·상실");
  await expect(page.locator(".employment-narrative")).toContainText("최근 1년 가입자");
  await expect(page.getByRole("heading", { name: "수집된 사업장명" })).toBeVisible();
  await expect(page.locator(".company-connections > .related-workplaces")).toContainText("동일 법인·계열사 여부는 확인되지 않았습니다.");
  const insights = await request.get("/api/v1/companies/177744/insights");
  expect(insights.status()).toBe(200);
  const data = (await insights.json()).data;
  expect(data.industry.employeeSampleCount).toBeGreaterThanOrEqual(30);
  expect(data.employment.snapshotMonth).toBe("2026-08");
  if (data.sizeCohort) expect(data.sizeCohort.employeeSampleCount).toBeGreaterThanOrEqual(30);
  else await expect(page.locator(".size-cohort")).toContainText("30곳 이상일 때 표시합니다.");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/expanded-detail-${width}.png`, fullPage: true });
  }
});

test("comparison supports search, add, remove and shared URLs on mobile and desktop", async ({ page, request }) => {
  await page.goto("/companies/177744");
  await page.getByRole("link", { name: "다른 회사와 비교" }).click();
  await expect(page.locator(".comparison-table")).toContainText("유한회사 나이키코리아");
  await page.getByRole("searchbox", { name: "비교할 회사명" }).fill("삼성전자");
  await page.locator(".compare-search button").click();
  await page.locator(".compare-candidates a").first().click();
  await expect(page.locator(".comparison-table thead th")).toHaveCount(3);
  await page.getByRole("searchbox", { name: "비교할 회사명" }).fill("현대자동차");
  await page.locator(".compare-search button").click();
  await page.locator(".compare-candidates a").first().click();
  await expect(page.locator(".comparison-table thead th")).toHaveCount(4);
  await expect(page.locator(".compare-candidates a")).toHaveCount(0);
  const ids = new URL(page.url()).searchParams.get("ids");
  const response = await request.get(`/api/v1/compare?ids=${ids}`);
  expect(response.status()).toBe(200);
  expect((await response.json()).data.companies).toHaveLength(3);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/comparison-${width}.png`, fullPage: true });
    const tableBounds = await page.locator(".comparison-scroll").boundingBox();
    const noteBounds = await page.locator(".compare-page > .detail-caveat").boundingBox();
    expect(noteBounds!.y - (tableBounds!.y + tableBounds!.height)).toBeGreaterThanOrEqual(17);
    if (width < 700) {
      const scroll = page.locator(".comparison-scroll");
      await scroll.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
      const visible = await page.locator(".comparison-company").last().evaluate((element) => {
        const container = element.closest(".comparison-scroll")!.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return box.left >= container.left && box.right <= container.right;
      });
      expect(visible).toBe(true);
      await page.screenshot({ path: `test-results/comparison-${width}-scrolled.png`, fullPage: true });
      await scroll.evaluate((element) => { element.scrollLeft = 0; });
    }
  }
  await page.getByRole("link", { name: "유한회사 나이키코리아 선택 해제" }).click();
  await expect(page.locator(".comparison-table thead th")).toHaveCount(3);
  await page.goto("/compare?ids=1,1");
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
});

test("populated size cohort renders salary and growth medians without mobile overflow", async ({ page, request }) => {
  const response = await request.get("/api/v1/companies/128813/insights");
  expect(response.status()).toBe(200);
  const data = (await response.json()).data;
  expect(data.sizeCohort.employeeSampleCount).toBeGreaterThanOrEqual(30);
  expect(data.sizeCohort.medianEmployeeChangePercent).not.toBeNull();
  await page.goto("/companies/128813");
  await expect(page.locator(".cohort-metric")).toHaveCount(2);
  await expect(page.locator(".size-cohort")).toContainText("가입자 50~299명");
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/size-cohort-${width}.png`, fullPage: true });
    await page.locator(".size-cohort").screenshot({ path: `test-results/size-cohort-section-${width}.png` });
    await page.locator(".employment-summary").screenshot({ path: `test-results/employment-section-${width}.png` });
  }
});
