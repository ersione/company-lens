import { expect, test } from "@playwright/test";

test("employment filters and sorting preserve scroll position on desktop and mobile", async ({ page }) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 500 });
    await page.goto("/employment-trends");
    for (const [navigation, name] of [
      ["비교 기간", "최근 3개월"], ["비교 기간", "전월 대비"], ["비교 기간", "1년 전 대비"],
      ["고용 변화 방향", "감소 업종"], ["고용 변화 정렬", "감소율순"], ["고용 변화 정렬", "감소 인원순"],
      ["고용 변화 방향", "증가 업종"], ["고용 변화 정렬", "증가율순"], ["고용 변화 정렬", "증가 인원순"]
    ]) {
      const link = page.getByRole("navigation", { name: navigation, exact: true }).getByRole("link", { name, exact: true });
      await link.evaluate((element) => element.scrollIntoView({ block: "center" }));
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(0);
      await link.click();
      await expect(link).toHaveAttribute("aria-current", "page");
      const after = await page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(window.scrollY)))));
      expect(Math.abs(after - before), `${width}px: ${name}`).toBeLessThanOrEqual(2);
    }
  }
});

test("employment rankings support yearly defaults, recent three months and declining industries", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/employment-trends");
  await expect(page.getByRole("heading", { name: "업종별 고용 변화", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "공개 통계" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "주 메뉴" }).locator("[aria-current=page]")).toHaveText("고용 변화");
  const highlight = page.locator(".employment-overview strong").first();
  expect(await highlight.evaluate(node => { const style=getComputedStyle(node); const rgb=style.getPropertyValue("--palette-purple").trim().slice(1).match(/../g)!.map(value=>parseInt(value,16)); return style.color === `rgb(${rgb.join(", ")})`; })).toBe(true);
  const period = page.getByRole("navigation", { name: "비교 기간" });
  const direction = page.getByRole("navigation", { name: "고용 변화 방향" });
  const sort = page.getByRole("navigation", { name: "고용 변화 정렬" });
  await expect(period.getByRole("link", { name: "1년 전 대비" })).toHaveAttribute("aria-current", "page");
  await expect(sort.getByRole("link", { name: "증가 인원순" })).toHaveAttribute("aria-current", "page");
  const changes = () => page.locator(".employment-ranking tbody tr").evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("data-change"))));
  const yearly = await changes();
  expect(yearly.length).toBeGreaterThan(0);
  expect(yearly.every((value, i) => value > 0 && (!i || value <= yearly[i - 1]))).toBe(true);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/employment-growth-${width}.png`, fullPage: true });
  }
  await period.getByRole("link", { name: "최근 3개월" }).click();
  await expect(page).toHaveURL(/period=3/);
  await expect(page.locator(".employment-context")).toContainText("3개월 연속 증가를 뜻하지 않습니다");
  await expect(period.getByRole("link", { name: "최근 3개월" })).toHaveAttribute("aria-current", "page");
  await direction.getByRole("link", { name: "감소 업종" }).click();
  await expect(page.getByRole("heading", { name: "가입자가 줄어든 업종" })).toBeVisible();
  const declining = await changes();
  expect(declining.length).toBeGreaterThan(0);
  expect(declining.every((value, i) => value < 0 && (!i || value >= declining[i - 1]))).toBe(true);
  await sort.getByRole("link", { name: "감소율순" }).click();
  await expect(page.locator(".statistics-footnote")).toContainText("1,000명 이상");
  const rates = await page.locator(".employment-ranking tbody tr").evaluateAll((rows) => rows.map((row) => Number(row.getAttribute("data-percent"))));
  expect(rates.every((value, i) => value < 0 && (!i || value >= rates[i - 1]))).toBe(true);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/employment-decline-${width}.png`, fullPage: true });
  }
  await page.locator(".employment-ranking tbody th a").first().click();
  await expect(page).toHaveURL(/\/industries\//);
  await expect(page.locator(".statistics-canvas[data-ready=true]")).toBeVisible();
  const xml = await (await request.get("/sitemap.xml")).text();
  expect(xml).toContain("/employment-trends</loc>");
  await page.goto("/employment-trends?period=invalid&direction=no&sort=no");
  await expect(period.getByRole("link", { name: "1년 전 대비" })).toHaveAttribute("aria-current", "page");
  expect(errors).toEqual([]);
});
