import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { getEmploymentBreakdown, getIndustryEmploymentChanges, getStatisticsGroups, getStatisticsHistory, getYearlyStatistics, rankEmploymentChanges, refreshPublicStatistics, resolveStatisticsHistory, statisticsChange, statisticsRegion } from "@/lib/public-statistics";
import sitemap from "@/app/sitemap";

test("monthly cube is additive, canonical, resumable, and read without scanning snapshots", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lens-public-statistics-"));
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "stats.sqlite");
  const { sqlite } = createDb();
  try {
    migrate(sqlite);
    const source = (id: number, month: string, published: string) => sqlite.prepare(`INSERT INTO source_files
      (id, source_name, file_name, snapshot_month, checksum, row_count, imported_at, published_at)
      VALUES (?, 'NPS', 'test.csv', ?, ?, 5, '2026-09-01', ?)`).run(id, month, String(id), published);
    source(1, "2026-08", "2026-09-01");
    source(2, "2026-07", "2026-08-01");
    for (let id = 1; id <= 5; id++) sqlite.prepare(`INSERT INTO companies
      (id, identity_key, name, normalized_name, address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', '')`)
      .run(id, String(id), `회사${id}`, `회사${id}`, id < 3 ? "경기도 수원시" : "강원도 춘천시");
    const insert = sqlite.prepare(`INSERT INTO company_snapshots
      (company_id, source_file_id, snapshot_month, subscription_status_code, employee_count,
       monthly_billed_amount, new_joiners, departures, industry) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    insert.run(1, 1, "2026-08", "1", 10, 950000, 2, 1, "제조업");
    insert.run(2, 1, "2026-08", "1", 90, 17100000, 3, 2, "제조업");
    insert.run(3, 1, "2026-08", "1", null, null, null, null, "");
    insert.run(4, 1, "2026-08", "1", 0, 500000, 0, 0, "BIZ_NO미존재사업장");
    insert.run(5, 1, "2026-08", "2", 1000, 999999, 10, 10, "탈퇴업종");
    insert.run(1, 2, "2026-07", "1", 5, 475000, 1, 0, "제조업");
    refreshPublicStatistics(sqlite, "2026-08");
    refreshPublicStatistics(sqlite, "2026-07");
    let history = getStatisticsHistory("total", "전국");
    assert.deepEqual(history.map((row) => row.month), ["2026-07", "2026-08"]);
    assert.equal(history[1].workplaceCount, 4);
    assert.equal(history[1].subscriberCount, 100);
    assert.equal(history[1].unknownEmployeeCount, 1);
    assert.equal(history[1].salarySubscriberCount, 100);
    assert.ok(Math.abs(history[1].annualSalary! - 18050000 * 12 / 0.095 / 100) < 0.01);
    assert.equal(statisticsChange(history, 1)?.count, 95);
    assert.equal(statisticsChange(history, 12), null);
    const yearly = getYearlyStatistics("total", "전국")[0];
    assert.equal(yearly.monthCount, 2);
    assert.equal(yearly.averageSubscriberCount, 52.5);
    assert.equal(yearly.endSubscriberCount, 100);
    assert.equal(yearly.newJoiners, 6);
    assert.equal(yearly.salarySubscriberMonths, 105);
    assert.ok(Math.abs(yearly.annualSalary! - (18050000 + 475000) * 12 / 0.095 / 105) < 0.01);
    const unknown = getStatisticsHistory("industry", "업종 정보 없음")[0];
    assert.equal(unknown.workplaceCount, 2);
    assert.equal(unknown.annualSalary, null);
    const subset = getEmploymentBreakdown({ from: "2026-08", to: "2026-08", region: "경기도", industry: "제조업", sizeBand: 2 });
    assert.equal(subset[0].subscriberCount, 10);
    assert.equal(subset[0].salaryBilledAmount, 950000);
    const all = getEmploymentBreakdown({ from: "2026-08", to: "2026-08" })[0];
    assert.equal(all.unknownJoinerCount, 1);
    assert.equal(all.unknownDepartureCount, 1);
    assert.equal(all.salaryWorkplaceCount, 2);
    assert.equal(getStatisticsGroups("industry").reduce((sum, row) => sum + row.subscriberCount, 0), 100);
    assert.equal(getStatisticsGroups("region").reduce((sum, row) => sum + row.workplaceCount, 0), 4);
    assert.equal(resolveStatisticsHistory("region", encodeURIComponent("경기도")).history.length, 2);
    assert.equal(resolveStatisticsHistory("region", "경기도").key, "경기도");
    const count = sqlite.prepare("SELECT COUNT(*) AS count FROM employment_monthly_cube").get();
    refreshPublicStatistics(sqlite, "2026-08");
    assert.deepEqual(sqlite.prepare("SELECT COUNT(*) AS count FROM employment_monthly_cube").get(), count);
    source(3, "2026-08", "2026-09-02");
    insert.run(1, 3, "2026-08", "1", 20, 1900000, 1, 1, "새 업종");
    refreshPublicStatistics(sqlite, "2026-08");
    history = getStatisticsHistory("total", "전국");
    assert.equal(history[1].subscriberCount, 20);
    assert.deepEqual(getStatisticsGroups("industry").map((row) => row.key), ["새 업종"]);
    assert.deepEqual(getEmploymentBreakdown({ from: "2026-08", to: "2026-08", industry: "제조업" }), []);
    const urls = sitemap().map((entry) => entry.url);
    assert.ok(urls.includes("https://companylens.ersione.com/statistics"));
    assert.ok(urls.some((url) => url.includes("/industries/")));
    assert.equal(urls.some((url) => /companies|admin|\?/.test(url)), false);
    sqlite.exec("DROP TABLE company_snapshots");
    assert.equal(getStatisticsHistory("total", "전국").length, 2);
    assert.equal(getStatisticsGroups("region")[0].key, "경기도");
    assert.equal(getEmploymentBreakdown({ from: "2026-07", to: "2026-08" }).length, 2);
    assert.throws(() => getEmploymentBreakdown({ from: "2026-99", to: "2026-08" }), /Invalid month/);
  } finally {
    sqlite.close();
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("region aliases are normalized with unknown regions kept visible", () => {
  assert.equal(statisticsRegion(" 전라북도 전주시"), "전북특별자치도");
  assert.equal(statisticsRegion("강원도 원주시"), "강원특별자치도");
  assert.equal(statisticsRegion("서울 강남구"), "서울특별시");
  assert.equal(statisticsRegion(null), "지역 정보 없음");
});

test("industry changes use exact months, exclude unmatched groups and rank safely without snapshots", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lens-employment-changes-"));
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "stats.sqlite");
  const { sqlite } = createDb();
  try {
    migrate(sqlite);
    sqlite.prepare(`INSERT INTO source_files (id, source_name, file_name, snapshot_month, checksum, row_count, imported_at)
      VALUES (1, 'NPS', 'fixture.csv', '2026-08', 'fixture', 0, '')`).run();
    const insert = sqlite.prepare("INSERT INTO public_monthly_statistics VALUES (?, ?, ?, 1, 10, ?, 0, 0, 0, 0, NULL, '')");
    for (const month of ["2026-08", "2026-05", "2025-08"]) insert.run("total", "전국", month, 10000);
    for (const [key, current, baseline] of [["증가업", 3000, 1000], ["감소업", 1000, 4000], ["소규모업", 100, 1],
      ["신규가입업", 500, 0], ["변화없음", 1000, 1000], ["업종 정보 없음", 9000, 10], ["복수 업종", 5000, 1]] as const) {
      insert.run("industry", key, "2026-08", current);
      insert.run("industry", key, "2025-08", baseline);
      insert.run("industry", key, "2026-05", current + 20);
    }
    insert.run("industry", "비교월없음", "2026-08", 999999);
    sqlite.exec("DROP TABLE company_snapshots");
    const yearly = getIndustryEmploymentChanges(12);
    assert.equal(yearly.month, "2026-08");
    assert.equal(yearly.previousMonth, "2025-08");
    assert.equal(yearly.hasBaseline, true);
    assert.equal(yearly.rows.some((row) => row.key === "비교월없음"), false);
    const options = { months: 12, direction: "increase", sort: "count" } as const;
    assert.deepEqual(rankEmploymentChanges(yearly.rows, options).map((row) => row.key), ["증가업", "신규가입업", "소규모업"]);
    assert.equal(yearly.rows.find((row) => row.key === "신규가입업")?.percent, null);
    assert.deepEqual(rankEmploymentChanges(yearly.rows, { ...options, sort: "rate" }).map((row) => row.key), ["증가업"]);
    assert.deepEqual(rankEmploymentChanges(yearly.rows, { ...options, direction: "decrease" }).map((row) => row.key), ["감소업"]);
    assert.equal(getIndustryEmploymentChanges(3).rows.find((row) => row.key === "증가업")?.change, -20);
    const missing = getIndustryEmploymentChanges(1);
    assert.equal(missing.hasBaseline, false);
    assert.deepEqual(missing.rows, []);
    assert.ok(sitemap().some((entry) => entry.url.endsWith("/employment-trends")));
  } finally {
    sqlite.close();
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
