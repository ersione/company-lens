import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { compactDatabase, verifyCompactDatabase } from "@/lib/compact-database";
import { getCompanyDetail, getCompanyHistory, getStatisticsOverview, searchCompanies } from "@/lib/company-queries";
import { importNpsCsv, requiredColumns } from "@/lib/nps-import";
import { estimatedMonthlySalarySql, estimateSalary } from "@/lib/pension";

test("separate compact database preserves identities, nulls, histories, statistics and future imports", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-compact-"));
  const source = path.join(directory, "legacy.sqlite");
  const destination = path.join(directory, "compact.sqlite");
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = source;
  const legacy = createDb(source);
  const file = path.join(directory, "source.csv");
  const contents = (month: string) => `${requiredColumns.join(",")}\n${month},테스트회사,123456,1,서울,,소프트웨어,10,950000,2,1\n${month},영인원회사,654321,1,부산,,,0,0,0,0\n${month},미상회사,987654,2,,,,,0,,\n`;
  try {
    migrate(legacy.sqlite);
    fs.writeFileSync(file, contents("202608"));
    await importNpsCsv(file, legacy);
    const idFor = (name: string) => (legacy.sqlite.prepare("SELECT id FROM companies WHERE name = ?").get(name) as { id: number }).id;
    const companyId = idFor("테스트회사");
    const expected = { detail: getCompanyDetail(companyId), history: getCompanyHistory(companyId),
      search: searchCompanies("테스트"), statistics: getStatisticsOverview() };
    legacy.sqlite.exec(`ALTER TABLE company_snapshots ADD COLUMN created_at TEXT;
      ALTER TABLE company_snapshots ADD COLUMN estimated_average_monthly_salary INTEGER;
      ALTER TABLE company_snapshots ADD COLUMN estimated_average_annual_salary INTEGER;
      UPDATE company_snapshots AS s SET created_at = 'now',
      estimated_average_monthly_salary = (${estimatedMonthlySalarySql("s")}),
      estimated_average_annual_salary = (${estimatedMonthlySalarySql("s")}) * 12;
      UPDATE sqlite_sequence SET seq = 100 WHERE name = 'companies';`);
    assert.throws(() => migrate(legacy.sqlite), /Legacy database/);
    const sourceVersion = legacy.sqlite.pragma("data_version", { simple: true });
    const report = compactDatabase(source, destination, () => {});
    assert.equal(legacy.sqlite.pragma("data_version", { simple: true }), sourceVersion);
    assert.equal(report.snapshots, 3);
    assert.equal(report.allRowsCompared, true);
    assert.equal(verifyCompactDatabase(source, destination, () => {}).allRowsCompared, true);
    assert.throws(() => compactDatabase(source, destination), /new database/);
    assert.throws(() => compactDatabase(source, source), /new database/);
    process.env.DATABASE_URL = destination;
    assert.deepEqual({ detail: getCompanyDetail(companyId), history: getCompanyHistory(companyId),
      search: searchCompanies("테스트"), statistics: getStatisticsOverview() }, expected);
    assert.equal(getCompanyDetail(idFor("영인원회사"))?.estimatedAverageAnnualSalary, null);
    assert.equal(getCompanyDetail(idFor("미상회사"))?.employeeCount, null);
    const compact = createDb(destination);
    try {
      assert.equal((compact.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'companies'").get() as { seq: number }).seq, 100);
      const columns = compact.sqlite.prepare("PRAGMA table_info(company_snapshots)").all() as { name: string }[];
      assert.ok(!columns.some(({ name }) => ["created_at", "estimated_average_monthly_salary", "estimated_average_annual_salary"].includes(name)));
      assert.equal((compact.sqlite.prepare("PRAGMA index_list(company_snapshots)").all()).length, 3);
      await assert.rejects(() => importNpsCsv(file, compact), /이미 가져온/);
      fs.writeFileSync(file, contents("202609"));
      await importNpsCsv(file, compact);
      assert.equal(getCompanyHistory(companyId).length, 2);
      assert.equal(getCompanyDetail(companyId)?.snapshotMonth, "2026-09");
      assert.equal(searchCompanies("테스트")[0].id, companyId);
      for (const month of ["2015-11", "2025-12", "2026-01", "2033-01", "2040-01"]) {
        for (const count of [null, 0, 1, 7, 125843]) {
          const salary = compact.sqlite.prepare(`SELECT (${estimatedMonthlySalarySql("s")}) AS value
            FROM (SELECT ? AS snapshot_month, ? AS employee_count, ? AS monthly_billed_amount) s`)
            .get(month, count, 77967664560) as { value: number | null };
          assert.equal(salary.value, estimateSalary(77967664560, count, month).estimatedAverageMonthlySalary);
        }
      }
    } finally { compact.sqlite.close(); }
    const damaged = path.join(directory, "damaged.sqlite");
    legacy.sqlite.exec("UPDATE company_snapshots SET estimated_average_annual_salary = 1 WHERE id = 1");
    assert.throws(() => compactDatabase(source, damaged, () => {}), /Snapshot mismatch/);
    assert.ok(!fs.existsSync(`${damaged}.verified.json`));
    assert.equal((legacy.sqlite.prepare("SELECT estimated_average_annual_salary AS salary FROM company_snapshots WHERE id = 1").get() as { salary: number }).salary, 1);
  } finally {
    legacy.sqlite.close();
    if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
