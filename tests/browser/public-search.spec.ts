import { expect, test } from "@playwright/test";

test("broad daily-worker searches fail safely without blocking status or subsequent searches", async ({ page, request }) => {
  const response = await request.get(`/api/v1/companies?q=${encodeURIComponent("(일용")}`, { timeout: 10000 });
  expect(response.status()).toBe(400);
  expect((await response.json()).error.message).toContain("검색 범위가 너무 넓습니다");
  expect(response.headers()["cache-control"]).toBe("no-store");
  await page.goto(`/?q=${encodeURIComponent("(일용")}`);
  await expect(page.locator("main").getByRole("alert")).toContainText("더 구체적으로");
  await page.goto(`/compare?q=${encodeURIComponent("(일용")}`);
  await expect(page.locator("main").getByRole("alert")).toContainText("더 구체적으로");
  expect((await request.get("/api/v1/status", { timeout: 5000 })).status()).toBe(200);
  expect((await request.get(`/api/v1/companies?q=${encodeURIComponent("삼성전자")}`, { timeout: 10000 })).status()).toBe(200);
});

test("web search rejects invalid and repeated q without results or rendering errors", async ({ page }) => {
  const failures: string[] = [];
  const rscCacheHeaders: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    const headers = response.headers();
    if (headers["content-type"]?.includes("text/x-component")) rscCacheHeaders.push(headers["cache-control"] ?? "");
  });
  for (const query of ["q=회사", "q=1--", "q=abc%25", "q=abc_", "q=%0A삼성전자", `q=${"가".repeat(101)}`, "q=삼성전자&q=네이버", "q=&q="]) {
    const response = await page.goto(`/?${query}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("#search-error")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "회사 검색" })).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(".results-section, a.result-row")).toHaveCount(0);
    expect(response?.headers()["cache-control"]).toContain("no-store");
  }
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/public-search-error-320.png", fullPage: true });
  await page.goto("/");
  await page.getByRole("textbox", { name: "회사 검색" }).fill("회사");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.locator("#search-error")).toBeVisible();
  await page.getByRole("textbox", { name: "회사 검색" }).fill("네이버");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.locator("a.result-row").first()).toBeVisible();
  await expect(page.locator("#search-error")).toHaveCount(0);
  expect(rscCacheHeaders.length).toBeGreaterThan(0);
  expect(rscCacheHeaders.every((value) => value.includes("no-store"))).toBe(true);
  expect(failures).toEqual([]);
});

test("query variants remain isolated and cache headers distinguish API, errors, spec and HTML", async ({ request }) => {
  const variants = [
    "/api/v1/companies?q=삼성전자&limit=1", "/api/v1/companies?q=네이버&limit=2",
    "/api/v1/companies?q=삼성전자&limit=2",
    "/api/v1/companies/4270/history?from=2026-07&to=2026-08&limit=1",
    "/api/v1/companies/4270/history?from=2026-08&to=2026-08&limit=2",
    "/api/v1/companies/4270/history?from=2026-07&to=2026-08&limit=2"
  ];
  const responses: { data: { companies?: unknown[]; snapshots?: { snapshotMonth: string }[]; query?: string; returnedCount: number } }[] = [];
  for (const url of variants) {
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("public, max-age=60");
    responses.push(await response.json());
  }
  expect(responses[0].data.returnedCount).toBe(1);
  expect(responses[1].data.query).toBe("네이버");
  expect(responses[1].data.returnedCount).toBe(2);
  expect(responses[2].data.returnedCount).toBe(2);
  expect(responses[0].data.companies?.[0]).not.toEqual(responses[1].data.companies?.[0]);
  expect(responses[3].data.snapshots?.map((row) => row.snapshotMonth)).toEqual(["2026-07"]);
  expect(responses[4].data.snapshots?.map((row) => row.snapshotMonth)).toEqual(["2026-08"]);
  expect(responses[5].data.snapshots?.map((row) => row.snapshotMonth)).toEqual(["2026-07", "2026-08"]);
  for (let index = 0; index < variants.length; index++) expect(await (await request.get(variants[index])).json()).toEqual(responses[index]);
  for (const [url, status] of [["/api/v1/companies?q=가", 400], ["/api/v1/companies/9007199254740991", 404]] as const) {
    const response = await request.get(url);
    expect(response.status()).toBe(status);
    expect(response.headers()["cache-control"]).toBe("no-store");
  }
  expect((await request.get("/api/openapi.json")).headers()["cache-control"]).toBe("public, max-age=300");
  const html = await request.get("/?q=삼성전자");
  expect(html.headers()["cache-control"]).toContain("no-store");
  expect(html.headers()["vary"].toLowerCase()).toContain("rsc");
});
