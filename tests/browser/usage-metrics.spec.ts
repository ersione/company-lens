import { test, expect } from "@playwright/test";
import Database from "better-sqlite3";

test("backend counts web/API operations and size cohorts without collecting browser history or prefetches", async ({ browser, request }) => {
  const file = process.env.PLAYWRIGHT_METRICS_DATABASE_URL;
  test.skip(!file, "Run against an isolated server with PLAYWRIGHT_METRICS_DATABASE_URL.");
  const context = await browser.newContext({ baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    userAgent: "Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36" });
  const page = await context.newPage();
  const usagePosts: string[] = [];
  page.on("request", (req) => { if (req.method() === "POST" && !new URL(req.url()).pathname.startsWith("/cdn-cgi/")) usagePosts.push(req.url()); });
  const count = (sql: string) => {
    try {
      const db = new Database(file!, { readonly: true, fileMustExist: true });
      try { return (db.prepare(sql).get() as { n: number }).n; }
      finally { db.close(); }
    } catch { return 0; }
  };
  const webSearch = "SELECT COALESCE(SUM(requests),0) AS n FROM request_daily WHERE channel='web' AND operation='search'";
  const apiSearch = "SELECT COALESCE(SUM(requests),0) AS n FROM request_daily WHERE channel='api' AND operation='search'";
  const webDetails = "SELECT COALESCE(SUM(views),0) AS n FROM company_daily WHERE channel='web'";
  const before = [count(webSearch), count(apiSearch), count(webDetails)];
  try {
    await page.goto("/?q=삼성전자");
    await expect(page.locator("#search-results-title")).toContainText("삼성전자");
    await expect.poll(() => count(webSearch)).toBe(before[0] + 1);
    // Use the actual result link regardless of changes to presentation classes.
    const target = await page.locator('a[href^="/companies/"]').first().getAttribute("href");
    expect(target).toBeTruthy();
    await page.goto(target!);
    await expect(page.locator(".company-identity h1")).toBeVisible();
    await expect.poll(() => count(webDetails)).toBe(before[2] + 1);
    expect(usagePosts).toEqual([]);
    const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
    // Next only treats this as a router prefetch when the RSC header is present too.
    await request.get(`${base}/?q=삼성전자`, { headers: { rsc: "1", "next-router-prefetch": "1", "user-agent": "Mozilla/5.0" } });
    await request.get(`${base}/?q=삼성전자`, { headers: { purpose: "prefetch", "user-agent": "Mozilla/5.0" } });
    await request.get(`${base}/?q=삼성전자`, { headers: { "user-agent": "Slackbot" } });
    await request.get(`${base}/api/v1/companies?q=삼성전자`);
    await expect.poll(() => count(apiSearch)).toBe(before[1] + 1);
    expect(count(webSearch)).toBe(before[0] + 1);
    const db = new Database(file!, { readonly: true });
    try {
      expect(db.prepare("SELECT 1 FROM company_daily WHERE channel='web' AND size_band != 'unknown'").get()).toBeTruthy();
      const columns = db.prepare("PRAGMA table_info(request_daily)").all() as { name: string }[];
      for (const field of ["ip", "user_id", "user_agent", "url"]) expect(columns.map((row) => row.name)).not.toContain(field);
    } finally { db.close(); }
  } finally { await context.close(); }
});
