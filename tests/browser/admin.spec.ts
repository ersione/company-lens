import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { parseEnv } from "node:util";

const localEnv = Object.assign({}, ...[".env", ".env.local"].map((file) => fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {}));
const username = process.env.PLAYWRIGHT_ADMIN_USER_ID ?? localEnv.ADMIN_USER_ID;
const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? localEnv.ADMIN_PASSWORD;

test("admin guards HTML/RSC, requires both credentials, renders charts and logs out", async ({ page, context, request, browser }) => {
  test.skip(!username || !password, "Configure the test admin credentials.");
  const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
  const response = await request.get("/admin");
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(response.headers()["x-robots-tag"]).toContain("noindex");
  const html = await response.text();
  expect(html).not.toContain("메트릭표본회사");
  expect(html.includes(password!)).toBe(false);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/admin-login-${width}.png` });
  }
  await page.getByLabel("아이디", { exact: true }).fill("arbitrary-user");
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-not-a-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("비밀번호");
  await page.getByLabel("비밀번호", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("아이디 또는 비밀번호");
  await page.getByLabel("아이디", { exact: true }).fill(username!);
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong-not-a-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("아이디 또는 비밀번호");
  await page.getByLabel("비밀번호", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "서비스 이용 통계" })).toBeVisible();
  await expect(page.locator('.admin-chart[data-ready="true"]')).toHaveCount(6);
  const sizeColors = await page.locator('.admin-size-shares i').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
  expect(new Set(sizeColors).size).toBe(7);
  const cookie = (await context.cookies()).find((row) => row.name === "company_lens_admin")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  expect(cookie.path).toBe("/admin");
  expect(cookie.secure).toBe(base.startsWith("https:"));
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator(".admin-table-scroll").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `test-results/admin-dashboard-${width}.png`, fullPage: true });
  }
  if (process.env.PLAYWRIGHT_ADMIN_FIXTURE === "1") {
    await expect(page.locator(".admin-table")).toContainText("메트릭표본회사");
    await expect(page.locator(".admin-company-ranking")).toContainText("삼성전자");
    await expect(page.locator(".admin-company-ranking li > strong")).toHaveText(["138건", "135건"]);
    for (const canvas of await page.locator("canvas").all()) {
      const pixels = await canvas.evaluate((el: HTMLCanvasElement) => {
        const bytes = el.getContext("2d")!.getImageData(0, 0, el.width, el.height).data;
        let count = 0;
        for (let i = 0; i < bytes.length; i += 4) if (bytes[i + 3] > 100 && Math.max(bytes[i], bytes[i + 1], bytes[i + 2]) - Math.min(bytes[i], bytes[i + 1], bytes[i + 2]) > 30) count++;
        return count;
      });
      expect(pixels).toBeGreaterThan(100);
    }
  }
  await page.getByLabel("기간", { exact: true }).selectOption("7");
  await page.getByLabel("채널", { exact: true }).selectOption("web");
  await page.getByRole("button", { name: "조회", exact: true }).click();
  await expect(page).toHaveURL(/days=7&channel=web/);
  await expect(page.locator(".admin-kpis")).toContainText("API 0");
  const isolated = await browser.newContext();
  try {
    const other = await isolated.newPage();
    await other.goto(`${base}/admin`);
    await expect(other.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  } finally { await isolated.close(); }
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  const rsc = await context.request.get(`${base}/admin?days=90`, { headers: { RSC: "1" } });
  expect(await rsc.text()).not.toContain("메트릭표본회사");
  await context.addCookies([{ ...cookie, value: "forged-session" }]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
  const crossOrigin = await request.post(`${base}/admin/session`, { headers: { origin: "https://evil.example" }, form: { password: password! } });
  expect(crossOrigin.status()).toBe(403);
});

test("admin empty data remains usable without fabricated chart values", async ({ page }) => {
  test.skip(!username || !password || process.env.PLAYWRIGHT_ADMIN_EMPTY !== "1", "Run against an empty isolated metrics database.");
  const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
  const response = await page.request.post(`${base}/admin/session`, { headers: { origin: base }, form: { username: username!, password: password! } });
  expect(response.status()).toBe(200);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "서비스 이용 통계" })).toBeVisible();
  await expect(page.locator(".admin-chart-empty")).toHaveCount(6);
  await expect(page.locator(".admin-table")).toContainText("검색 기록이 없습니다.");
  await expect(page.locator(".admin-kpis")).toContainText("웹 0 · API 0");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/admin-empty-390.png", fullPage: true });
});
