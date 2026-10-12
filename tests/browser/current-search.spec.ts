import { expect, test } from "@playwright/test";

test("current workplaces are default and historical results are labeled", async ({ page, request }) => {
  const data = (await (await request.get("/api/v1/companies?q=국민은행&limit=20")).json()).data;
  const status = (await (await request.get("/api/v1/status")).json()).data;
  expect(data.includeHistory).toBe(false);
  expect(data.totalCount).toBe(3);
  expect(data.companies.every((row: { snapshotMonth: string }) => row.snapshotMonth === status.latestSnapshotMonth)).toBe(true);
  await page.goto("/?q=국민은행");
  const checkbox = page.getByRole("checkbox", { name: "과거 사업장 포함" });
  await expect(checkbox).not.toBeChecked();
  await expect(page.locator("a.result-row")).toHaveCount(3);
  await checkbox.check();
  await expect(page).toHaveURL(/includeHistory=true/);
  await expect(page.locator("a.result-row")).toHaveCount(11);
  await expect(page.locator(".historical-workplace")).toHaveCount(8);
  await expect(page.locator(".historical-workplace").first()).toContainText("최신 자료에 없음 · 마지막 관측");
  expect((await request.get("/api/v1/companies/33448909")).status()).toBe(200);
  expect((await request.get("/api/v1/companies/33448909/history")).status()).toBe(200);
  await page.reload();
  await expect(checkbox).toBeChecked();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".search-section").screenshot({ path: `test-results/history-controls-${width}.png` });
  }
  await checkbox.uncheck();
  await expect(page.locator("a.result-row")).toHaveCount(3);
});

test("historical option survives paging and invalid values are rejected", async ({ page, request }) => {
  await page.goto("/?q=삼성전자&includeHistory=true&sort=relevance");
  await page.getByRole("navigation", { name: "검색 결과 페이지" }).getByRole("link", { name: "다음", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  expect(new URL(page.url()).searchParams.get("includeHistory")).toBe("true");
  await expect(page.getByRole("checkbox", { name: "과거 사업장 포함" })).toBeChecked();
  await page.getByRole("checkbox", { name: "과거 사업장 포함" }).uncheck();
  await expect(page).not.toHaveURL(/page=2/);
  for (const value of ["1", "", "true&includeHistory=false"]) {
    expect((await request.get(`/api/v1/companies?q=국민은행&includeHistory=${value}`)).status()).toBe(400);
  }
  expect((await request.get("/api/v1/companies?q=숲")).status()).toBe(400);
  expect((await request.get("/api/v1/companies?q=국민은행&includeHistory=false")).status()).toBe(200);
});
