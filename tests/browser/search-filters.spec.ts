import { expect, test } from "@playwright/test";

test("filters submit, reset the page, survive reload/back and stay within mobile bounds", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?q=삼성전자&page=2");
  await page.getByRole("combobox", { name: "지역", exact: true }).selectOption("경기도");
  await expect(page).toHaveURL(/region=/);
  expect(new URL(page.url()).searchParams.has("page")).toBe(false);
  await expect(page.getByRole("combobox", { name: "지역", exact: true })).toHaveValue("경기도");
  await page.getByRole("combobox", { name: "가입자 규모" }).selectOption("50");
  await expect(page).toHaveURL(/minEmployees=50/);
  await page.getByRole("combobox", { name: "정렬", exact: true }).selectOption("employees");
  await expect(page).toHaveURL(/sort=employees/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "지역", exact: true })).toHaveValue("경기도");
  await expect(page.getByRole("combobox", { name: "가입자 규모" })).toHaveValue("50");
  await expect(page.getByRole("combobox", { name: "정렬", exact: true })).toHaveValue("employees");
  const response = await request.get("/api/v1/companies?q=삼성전자&region=경기도&minEmployees=50&sort=employees&limit=20");
  expect(response.status()).toBe(200);
  const found = (await response.json()).data;
  const links = page.locator("a.result-row");
  await expect(links).toHaveCount(found.companies.length);
  expect(await links.evaluateAll((items) => items.map((item) => item.getAttribute("href")))).toEqual(found.companies.map((company: { id: number }) => `/companies/${company.id}`));
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator(".example-company span").evaluateAll((labels) => labels.every((label) => {
      const rect = label.getBoundingClientRect();
      return rect.height <= parseFloat(getComputedStyle(label).lineHeight) + 1
        && rect.right <= label.parentElement!.getBoundingClientRect().right - 5;
    }))).toBe(true);
    await page.screenshot({ path: `test-results/search-filters-${width}.png`, fullPage: true });
    await page.locator(".search-section").screenshot({ path: `test-results/search-controls-${width}.png` });
  }
  await page.getByRole("link", { name: "초기화", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "지역", exact: true })).toHaveValue("");
  await page.goBack();
  await expect(page.getByRole("combobox", { name: "지역", exact: true })).toHaveValue("경기도");
  expect(errors).toEqual([]);
});

test("pagination keeps filters, avoids duplicate rows, and invalid filters show errors", async ({ page, request }) => {
  const condition = "q=삼성전자&sort=employees";
  const first = (await (await request.get(`/api/v1/companies?${condition}&limit=20`)).json()).data;
  expect(first.hasMore).toBe(true);
  expect(first.totalCount).toBeGreaterThan(20);
  expect(first.totalPages).toBe(Math.ceil(first.totalCount / 20));
  await page.goto(`/?${condition}`);
  await page.getByRole("navigation", { name: "검색 결과 페이지" }).getByRole("link", { name: "다음", exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  expect(new URL(page.url()).searchParams.get("sort")).toBe("employees");
  const second = (await (await request.get(`/api/v1/companies?${condition}&limit=20&page=2`)).json()).data;
  expect(second.totalCount).toBe(first.totalCount);
  expect(second.totalPages).toBe(first.totalPages);
  const ids = first.companies.map((company: { id: number }) => company.id);
  expect(second.companies.every((company: { id: number }) => !ids.includes(company.id))).toBe(true);
  await expect(page.locator("a.result-row")).toHaveCount(second.companies.length);
  await page.getByRole("navigation", { name: "검색 결과 페이지" }).getByRole("link", { name: "이전", exact: true }).click();
  await expect(page.locator(".section-heading")).toContainText("1페이지");
  for (const condition of ["page=1001", "page=1&page=2", "region=서울", "region=경기도&region=경기도", "sort=random", "minEmployees=-1"]) {
    await page.goto(`/?q=삼성전자&${condition}`);
    await expect(page.locator("#search-error")).toBeVisible();
    await expect(page.locator("a.result-row")).toHaveCount(0);
    const response = await request.get(`/api/v1/companies?q=삼성전자&${condition}`);
    expect(response.status()).toBe(400);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
});

test("numbered pages show exact totals, jump to last and recover from out-of-range URLs without mobile overflow", async ({ page, request }) => {
  const condition = "q=삼성전자&sort=employees";
  const data = (await (await request.get(`/api/v1/companies?${condition}&limit=20`)).json()).data;
  await page.goto(`/?${condition}&page=10`);
  const navigation = page.getByRole("navigation", { name: "검색 결과 페이지" });
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("10");
  await expect(page.locator(".section-heading")).toContainText(`총 ${data.totalCount.toLocaleString('ko-KR')}개`);
  await expect(page.locator(".section-heading")).toContainText(`${data.totalPages}페이지`);
  for (const width of [1280,390,320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await navigation.screenshot({ path: `test-results/numbered-pagination-${width}.png` });
  }
  await navigation.getByRole("link", { name: `${data.totalPages}페이지`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`page=${data.totalPages}$`));
  await expect(navigation.locator('[aria-current="page"]')).toHaveText(String(data.totalPages));
  await expect(navigation.locator('.page-next')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator("a.result-row")).toHaveCount(data.totalCount % 20 || 20);
  await page.goto(`/?${condition}&page=1000`);
  await expect(page.locator("a.result-row")).toHaveCount(0);
  await page.getByRole("link", { name: "첫 페이지로 돌아가기" }).click();
  await expect(navigation.locator('[aria-current="page"]')).toHaveText("1");
  expect(new URL(page.url()).searchParams.get('sort')).toBe('employees');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
});
