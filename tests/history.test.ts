import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import iconv from "iconv-lite";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { importNpsCsv, requiredColumns } from "@/lib/nps-import";
import { getCompanyDetail, getCompanyHistory, getStatisticsOverview, searchCompanies } from "@/lib/company-queries";
import { rebuildCompanyLatest } from "@/lib/company-latest";
import { fillHistoryMonths } from "@/lib/history-series";
import { parseArchiveList } from "@/lib/nps-archive";
import { getStatisticsHistory, getYearlyStatistics } from "@/lib/public-statistics";

test("legacy compressed history keeps latest metadata, canonical revisions and persisted statistics", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-history-"));
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const client = createDb();
  const write = (name: string, month: string, industry: string, employees: number, legacy = false) => {
    const header = requiredColumns.map((column) => legacy ? `${column} EXAMPLE VARCHAR(100)` : column).join(",");
    const contents = `${header}\n${month},히스토리회사,123456,1,서울시 강남구,,${industry},${employees},950000,2,1\n${month},탈퇴회사,654321,2,서울시 중구,,기타,99,950000,0,0\n`;
    const file = path.join(directory, name);
    fs.writeFileSync(file, legacy ? gzipSync(iconv.encode(contents, "euc-kr")) : contents);
    return file;
  };
  try {
    migrate(client.sqlite);
    rebuildCompanyLatest(client.sqlite);
    await importNpsCsv(write("latest.csv", "202608", "새 업종", 20), client, undefined, { publishedAt: "2026-09-23" });
    await importNpsCsv(write("legacy.csv.gz", "201511", "옛 업종", 10, true), client, undefined, { publishedAt: "2019-08-05" });
    const company = client.sqlite.prepare("SELECT id FROM companies WHERE name = '히스토리회사'").get() as { id: number };
    assert.equal(getCompanyDetail(company.id)?.industry, "새 업종");
    assert.deepEqual(getCompanyHistory(company.id).map((row) => row.snapshotMonth), ["2015-11", "2026-08"]);
    const stored = client.sqlite.prepare("SELECT industry_distribution FROM monthly_statistics WHERE snapshot_month = '2015-11'").get() as { industry_distribution: string };
    assert.equal(JSON.parse(stored.industry_distribution)[0].label, "옛 업종");
    assert.equal(getStatisticsOverview()?.activeWorkplaceCount, 1);
    assert.equal(getStatisticsOverview()?.subscriberCount, 20);
    assert.equal(searchCompanies("히스토리회사")[0].employeeCount, 20);
    await importNpsCsv(write("older-revision.csv", "202608", "이전 수정본", 15), client, undefined, { publishedAt: "2026-09-22" });
    assert.equal(getCompanyHistory(company.id).length, 2);
    assert.equal(getCompanyDetail(company.id)?.industry, "새 업종");
    assert.equal(getCompanyDetail(company.id)?.employeeCount, 20);
    assert.equal(getStatisticsOverview()?.subscriberCount, 20);
    await importNpsCsv(write("newer-revision.csv", "202608", "새 업종", 25), client, undefined, { publishedAt: "2026-09-24" });
    assert.equal(getCompanyHistory(company.id).length, 2);
    assert.equal(getCompanyDetail(company.id)?.employeeCount, 25);
    assert.equal(getStatisticsOverview()?.subscriberCount, 25);
    assert.equal(getStatisticsHistory("total", "전국").at(-1)?.subscriberCount, 25);
    assert.equal(getYearlyStatistics("total", "전국")[0].endSubscriberCount, 25);
    assert.equal(searchCompanies("히스토리회사")[0].employeeCount, 25);
    const compressed = write("duplicate.csv.gz", "202608", "새 업종", 25, true);
    const bytes = iconv.encode(`${requiredColumns.join(",")}\n202608,히스토리회사,123456,1,서울시 강남구,,새 업종,25,950000,2,1\n202608,탈퇴회사,654321,2,서울시 중구,,기타,99,950000,0,0\n`, "utf-8");
    fs.writeFileSync(compressed, gzipSync(bytes));
    await assert.rejects(() => importNpsCsv(compressed, client), /이미 가져온/);
  } finally {
    client.sqlite.close();
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("history fills absent months with null rather than invented zeroes", () => {
  const base = { employeeCount: 10, estimatedAverageAnnualSalary: null, newJoiners: null, departures: null };
  const result = fillHistoryMonths([{ ...base, snapshotMonth: "2025-12" }, { ...base, snapshotMonth: "2026-02" }]);
  assert.deepEqual(result.map((row) => row.snapshotMonth), ["2025-12", "2026-01", "2026-02"]);
  assert.equal(result[1].employeeCount, null);
  assert.deepEqual(fillHistoryMonths([]), []);
});

test("archive list parsing preserves official identifiers and publication dates", () => {
  const rows = parseArchiveList(`<table><tr><td><a class="openFileDetailPopup" data-public-pk="uddi:old" data-public-detail-sn="2">국민연금 가입 사업장 내역 2015년 12월</a></td><td>2019-08-05</td></tr></table>`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].history, "2");
  assert.equal(rows[0].publishedAt, "2019-08-05");
});
