import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import SwaggerParser from "@apidevtools/swagger-parser";
import { Ajv } from "ajv";
import type { AnySchema } from "ajv";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { rebuildCompanySearchIndex } from "@/lib/company-search-index";
import { refreshCompanyBenchmarks } from "@/lib/company-benchmarks";
import { openApiDocument } from "@/lib/openapi";
import { GET as search } from "@/app/api/v1/companies/route";
import { GET as detail } from "@/app/api/v1/companies/[id]/route";
import { GET as history } from "@/app/api/v1/companies/[id]/history/route";
import { GET as status } from "@/app/api/v1/status/route";
import { GET as specification } from "@/app/api/openapi.json/route";
import { GET as insights } from "@/app/api/v1/companies/[id]/insights/route";
import { GET as compare } from "@/app/api/v1/compare/route";
import { apiResponse } from "@/lib/company-api";

const request = (url: string) => new Request(`http://localhost${url}`);
const context = (id: string) => ({ params: Promise.resolve({ id }) });

test("API routes and OpenAPI contract agree on local fixture data", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-api-"));
  const previousUrl = process.env.DATABASE_URL;
  const previousMetrics = process.env.METRICS_DISABLED;
  process.env.METRICS_DISABLED = "1";
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const client = createDb();
  try {
    migrate(client.sqlite);
    client.sqlite.exec(`
      INSERT INTO companies (identity_key, name, normalized_name, registration_number, created_at, updated_at)
      VALUES ('a', '테스트회사', '테스트회사', '1234567890', 'now', 'now'),
        ('b', '테스트회사 지점', '테스트회사 지점', NULL, 'now', 'now'),
        ('c', '이전회사', '이전회사', NULL, 'now', 'now');
      INSERT INTO source_files (source_name, file_name, snapshot_month, checksum, row_count, imported_at)
      VALUES ('test', 'private.csv', '2026-08', 'test', 3, '2026-09-23T00:00:00.000Z');
      INSERT INTO company_snapshots (company_id, source_file_id, snapshot_month, subscription_status_code, employee_count, monthly_billed_amount, new_joiners, departures)
      VALUES (1, 1, '2026-06', '1', 8, 720000, 2, 1),
        (1, 1, '2026-07', '1', 10, 950000, 3, 1),
        (1, 1, '2026-08', '1', 12, 1368000, 4, 2),
        (2, 1, '2026-08', '1', 0, 0, NULL, NULL),
        (3, 1, '2026-06', '1', 5, 450000, 1, 1);
      INSERT INTO monthly_statistics (snapshot_month, source_file_id, workplace_count, active_workplace_count, subscriber_count,
        unknown_employee_count, new_joiners, departures, industry_distribution, size_distribution, generated_at)
      VALUES ('2026-08', 1, 2, 1, 12, 0, 4, 2, '[]', '[]', 'now');
    `);
    rebuildCompanySearchIndex(client.sqlite);
    refreshCompanyBenchmarks(client.sqlite, "2026-08");
    const document = JSON.parse(JSON.stringify(openApiDocument));
    await SwaggerParser.validate(document);
    const resolved = await SwaggerParser.dereference(JSON.parse(JSON.stringify(openApiDocument))) as unknown as {
      components: { schemas: Record<string, AnySchema> }
    };
    const ajv = new Ajv({ strict: false, allErrors: true });
    ajv.addFormat("uri", true);
    async function check(response: Response, schemaName: string, expectedStatus = 200) {
      assert.equal(response.status, expectedStatus);
      assert.equal(response.headers.get("cache-control"), expectedStatus === 200 ? "public, max-age=60" : "no-store");
      const body = await response.json();
      const validate = ajv.compile(resolved.components.schemas[schemaName]);
      assert.ok(validate(body), JSON.stringify(validate.errors));
      assert.ok(!JSON.stringify(body).includes("private.csv"));
      return body;
    }
    await t.test("search is bounded, excludes private fields, and accepts numeric searches", async () => {
      const body = await check(search(request("/api/v1/companies?q=테스트&limit=1")), "SearchResponse");
      assert.equal(body.data.returnedCount, 1);
      assert.equal(body.data.totalCount, 1);
      assert.equal(body.data.totalPages, 1);
      assert.equal(body.data.hasMore, false);
      assert.equal(body.data.companies[0].id, 1);
      assert.equal(body.data.sort,"employees");
      assert.equal(body.meta.salaryBasis, "국민연금 기반 추정치");
      assert.equal((await check(search(request("/api/v1/companies?q=123-456")), "SearchResponse")).data.companies[0].id, 1);
      assert.deepEqual((await check(search(request("/api/v1/companies?q=없는사업장")), "SearchResponse")).data.companies, []);
    });
    await t.test("invalid searches and limits fail before querying", async () => {
      for (const query of ["", "?q=", "?q=가", "?q=abc%25", "?q=abc_", "?q=abc%00", "?q=---", "?q=1--", `?q=${"가".repeat(101)}`,
        "?q=테스트&limit=0", "?q=테스트&limit=21", "?q=테스트&limit=1.2", "?q=테스트&limit=01", "?q=테스트&limit=1e1",
        "?q=테스트&q=중복값", "?q=테스트&offset=1", "?q=테스트&page=0", "?q=테스트&page=1001",
        "?q=테스트&page=01", "?q=테스트&page=1&page=2", "?q=테스트&region=서울", "?q=테스트&sort=random",
        "?q=테스트&minEmployees=-1", "?q=테스트&minEmployees=10000001", "?q=테스트&minEmployees=1.5"]) {
        await check(search(request(`/api/v1/companies${query}`)), "Error", 400);
      }
    });
    await t.test("two-character names match inside legal names and numeric separators preserve results", async () => {
      client.sqlite.exec("UPDATE companies SET name='주식회사티빙',normalized_name='주식회사티빙' WHERE id=3");
      try {
        assert.equal((await check(search(request("/api/v1/companies?q=티빙")), "SearchResponse")).data.totalCount, 0);
        const body = (await check(search(request("/api/v1/companies?q=티빙&includeHistory=true")), "SearchResponse")).data;
        assert.equal(body.totalCount, 1);
        assert.equal(body.companies[0].id, 3);
        assert.equal(body.companies[0].name, "주식회사티빙");
        for (const query of ["12", "1-2", "1%20-%202"]) {
          const data = (await check(search(request(`/api/v1/companies?q=${query}`)), "SearchResponse")).data;
          assert.deepEqual(data.companies.map((company: { id: number }) => company.id), [1]);
        }
      } finally { client.sqlite.exec("UPDATE companies SET name='이전회사',normalized_name='이전회사' WHERE id=3"); }
    });
    await t.test("search pagination and filters extend the existing response contract", async () => {
      client.sqlite.exec("UPDATE companies SET address = '서울특별시 강남구' WHERE id = 1");
      const first = (await check(search(request("/api/v1/companies?q=테스트&limit=1")), "SearchResponse")).data;
      const second = (await check(search(request("/api/v1/companies?q=테스트&limit=1&page=2")), "SearchResponse")).data;
      assert.equal(first.page, 1);
      assert.equal(second.page, 2);
      assert.equal(second.totalCount, first.totalCount);
      assert.equal(second.totalPages, first.totalPages);
      assert.equal(first.companies[0].id, 1);
      assert.deepEqual(second.companies, [], "single-month zero record is excluded before pagination");
      assert.equal(second.hasMore, false);
      const filtered = (await check(search(request("/api/v1/companies?q=테스트&region=서울특별시&minEmployees=10&sort=employees")), "SearchResponse")).data;
      assert.equal(filtered.region, "서울특별시");
      assert.equal(filtered.minEmployees, 10);
      assert.equal(filtered.sort, "employees");
      assert.deepEqual(filtered.companies.map((row: { id: number }) => row.id), [1]);
      assert.equal(filtered.totalCount, 1);
      assert.equal(filtered.totalPages, 1);
      assert.deepEqual((await check(search(request("/api/v1/companies?q=테스트&page=1000")), "SearchResponse")).data.companies, []);
    });
    await t.test("detail includes comparisons, cached percentiles, and handles nulls", async () => {
      const body = await check(await detail(request("/api/v1/companies/1"), context("1")), "DetailResponse");
      assert.equal(body.data.comparison.employeeCountDelta, 2);
      assert.equal(body.data.comparison.previousSnapshotMonth, "2026-07");
      assert.equal(body.data.netSubscribers, 2);
      assert.equal(body.data.benchmark.employeeTopPercent, 100);
      const empty = (await check(await detail(request("/api/v1/companies/2"), context("2")), "DetailResponse")).data;
      assert.equal(empty.estimatedAverageMonthlySalary, null);
      assert.equal(empty.address, null);
      assert.equal(empty.industry, null);
      assert.equal(empty.benchmark, null);
      assert.equal(empty.comparison.employeeCountDelta, null);
      assert.equal(empty.netSubscribers, null);
      const old = (await check(await detail(request("/api/v1/companies/3"), context("3")), "DetailResponse")).data;
      assert.equal(old.benchmark, null);
      assert.equal(old.comparison.previousSnapshotMonth, null);
    });
    await t.test("history filters inclusive months and reports truncation", async () => {
      const body = await check(await history(request("/api/v1/companies/1/history?from=2026-07&to=2026-08&limit=1"), context("1")), "HistoryResponse");
      assert.equal(body.data.hasMore, true);
      assert.deepEqual(body.data.snapshots.map((row: { snapshotMonth: string }) => row.snapshotMonth), ["2026-07"]);
      const all = await check(await history(request("/api/v1/companies/1/history"), context("1")), "HistoryResponse");
      assert.equal(all.data.snapshots.length, 3);
      assert.equal(all.data.hasMore, false);
      const empty = await check(await history(request("/api/v1/companies/1/history?from=2027-01"), context("1")), "HistoryResponse");
      assert.deepEqual(empty.data.snapshots, []);
      for (const query of ["from=2026-13", "from=2026-00", "from=2026-1", "from=2026-09&to=2026-08", "limit=241", "limit=-1", "from=2026-01&from=2026-02"]) {
        await check(await history(request(`/api/v1/companies/1/history?${query}`), context("1")), "Error", 400);
      }
    });
    await t.test("insights and comparison expose bounded honest facts under the OpenAPI contract", async () => {
      const result = (await check(await insights(request("/api/v1/companies/1/insights"), context("1")), "InsightsResponse")).data;
      assert.equal(result.employment.consecutiveMonths, 2);
      assert.equal(result.employment.employeeDelta, null);
      assert.equal(result.industry, null);
      assert.equal(result.relatedCandidates.length, 0);
      assert.deepEqual(result.observedNames, []);
      const comparison = (await check(compare(request("/api/v1/compare?ids=1,3")), "ComparisonResponse")).data;
      assert.equal(comparison.sameSnapshotMonth, false);
      assert.deepEqual(comparison.companies.map((row: { id: number }) => row.id), [1, 3]);
      for (const query of ["", "?ids=1", "?ids=1,1", "?ids=1,2,3,4", "?ids=1,2&ids=2,3", "?ids=1,2&x=y"]) {
        await check(compare(request(`/api/v1/compare${query}`)), "Error", 400);
      }
      await check(compare(request("/api/v1/compare?ids=1,999")), "Error", 404);
      await check(await insights(request("/api/v1/companies/999/insights"), context("999")), "Error", 404);
      await check(await insights(request("/api/v1/companies/1/insights?q=abc"), context("1")), "Error", 400);
      const addCompany = client.sqlite.prepare(`INSERT INTO companies (id,identity_key,name,normalized_name,created_at,updated_at)
        VALUES (?, ?, '중간값표본', '중간값표본', 'now', 'now')`);
      const addSnapshot = client.sqlite.prepare(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,subscription_status_code,industry,employee_count,monthly_billed_amount)
        VALUES (?,1,'2026-08','1','비교업종',10,950000)`);
      for (let id = 100; id < 130; id++) { addCompany.run(id, `median-${id}`); addSnapshot.run(id); }
      client.sqlite.exec("UPDATE company_snapshots SET industry = '비교업종' WHERE company_id = 1 AND snapshot_month = '2026-08'");
      refreshCompanyBenchmarks(client.sqlite, "2026-08");
      const populated = (await check(await insights(request("/api/v1/companies/1/insights"), context("1")), "InsightsResponse")).data;
      assert.equal(populated.industry.employeeSampleCount, 31);
      assert.equal(populated.industry.medianEmployeeCount, 10);
      assert.equal(populated.industry.medianAnnualSalary, 12000000);
    });
    await t.test("invalid and missing IDs use consistent errors", async () => {
      for (const id of ["0", "-1", "1.5", "01", "1e2", "9007199254740992", "abc"]) {
        await check(await detail(request(`/api/v1/companies/${id}`), context(id)), "Error", 400);
        await check(await history(request(`/api/v1/companies/${id}/history`), context(id)), "Error", 400);
      }
      await check(await detail(request("/api/v1/companies/999"), context("999")), "Error", 404);
      await check(await history(request("/api/v1/companies/999/history"), context("999")), "Error", 404);
      await check(await detail(request("/api/v1/companies/1?unknown=yes"), context("1")), "Error", 400);
    });
    await t.test("status and served specification are usable without credentials", async () => {
      const body = await check(status(request("/api/v1/status")), "StatusResponse");
      assert.equal(body.data.latestSnapshotMonth, "2026-08");
      const served = await specification().json();
      assert.deepEqual(served.security, []);
      await SwaggerParser.validate(served);
    });
    await t.test("internal errors do not leak diagnostics", async () => {
      const original = console.error;
      console.error = () => {};
      try {
        const body = await check(apiResponse(() => { throw new Error("secret SQL /data/db/path"); }), "Error", 500);
        assert.equal(body.error.code, "INTERNAL_ERROR");
        assert.ok(!JSON.stringify(body).includes("secret"));
      } finally { console.error = original; }
    });
  } finally {
    if (previousMetrics === undefined) delete process.env.METRICS_DISABLED;
    else process.env.METRICS_DISABLED = previousMetrics;
    client.sqlite.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
