import { expect, test } from "@playwright/test";

test("public API serves real indexed data, documented errors, and OpenAPI", async ({ request, page }) => {
  const search = await request.get("/api/v1/companies", { params: { q: "삼성전자", limit: 2 } });
  expect(search.status()).toBe(200);
  expect(search.headers()["cache-control"]).toBe("public, max-age=60");
  const found = await search.json();
  expect(found.data.companies).toHaveLength(2);
  expect(found.meta.salaryBasis).toBe("국민연금 기반 추정치");
  const id = found.data.companies[0].id;
  const detail = await request.get(`/api/v1/companies/${id}`);
  expect(detail.status()).toBe(200);
  const company = (await detail.json()).data;
  expect(company.id).toBe(id);
  expect(company).not.toHaveProperty("sourceFileName");
  expect(company.employeeCount).toBe(found.data.companies[0].employeeCount);
  const history = await request.get(`/api/v1/companies/${id}/history`, { params: { from: "2026-07", to: "2026-08" } });
  expect(history.status()).toBe(200);
  const rows = (await history.json()).data.snapshots;
  expect(rows.map((row: { snapshotMonth: string }) => row.snapshotMonth)).toEqual(["2026-07", "2026-08"]);
  expect(rows.at(-1).employeeCount).toBe(company.employeeCount);
  const bad = await request.get("/api/v1/companies?q=가");
  expect(bad.status()).toBe(400);
  expect((await bad.json()).error.code).toBe("INVALID_REQUEST");
  expect((await request.get("/api/v1/companies/9007199254740991")).status()).toBe(404);
  expect((await request.post("/api/v1/companies")).status()).toBe(405);
  expect((await request.get("/api/v1/status")).status()).toBe(200);
  const spec = await request.get("/api/openapi.json");
  expect(spec.status()).toBe(200);
  const document = await spec.json();
  expect(document.openapi).toBe("3.0.3");
  expect(document.paths["/api/v1/companies/{id}/history"].get.operationId).toBe("getCompanyHistory");
  await page.goto("/api-docs");
  await expect(page.getByRole("heading", { name: "Company Lens API", exact: true })).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator(".api-docs-page table").evaluateAll((tables) => tables.every((table) => table.getBoundingClientRect().right <= innerWidth))).toBe(true);
    await page.screenshot({ path: `test-results/api-docs-${width}.png`, fullPage: true });
  }
});
