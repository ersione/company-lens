import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { migrate } from "@/db/migrate";
import { refreshCompanyBenchmarks } from "@/lib/company-benchmarks";
import { refreshMonthlyStatistics } from "@/lib/monthly-statistics";

test("benchmarks compare canonical active workplaces, retain ties and protect small cohorts", () => {
  const db = new Database(":memory:");
  try {
    migrate(db);
    db.exec(`INSERT INTO source_files (id,source_name,file_name,snapshot_month,checksum,row_count,imported_at,published_at)
      VALUES (1,'NPS','latest.csv','2026-08','one',40,'now','2026-09-23'),
        (2,'NPS','older.csv','2026-07','two',1,'now','2026-08-23');`);
    const company = db.prepare(`INSERT INTO companies (id,identity_key,name,normalized_name,created_at,updated_at)
      VALUES (?, ?, ?, ?, 'now', 'now')`);
    const snapshot = db.prepare(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,
      subscription_status_code,employee_count,monthly_billed_amount,industry) VALUES (?,1,'2026-08',?,?,?,?)`);
    for (let i = 1; i <= 40; i++) {
      company.run(i, `id-${i}`, `Company ${i}`, `company ${i}`);
      snapshot.run(i, i === 40 ? "0" : "1", i === 39 ? 0 : i,
        i === 38 ? null : i === 37 ? 0 : i * 9500,
        i <= 33 ? "제조업" : i <= 35 ? "소규모 업종" : null);
    }
    refreshMonthlyStatistics(db, "2026-08");
    const rows = db.prepare("SELECT * FROM company_benchmarks ORDER BY company_id").all() as Record<string, number | null>[];
    assert.equal(rows.length, 38);
    assert.equal(rows[0].employee_sample_count, 38);
    assert.equal(rows[0].salary_sample_count, 36);
    assert.equal(rows[0].salary_top_percent, 100, "equal salaries share the conservative cumulative percentile");
    assert.equal(rows[0].industry_salary_top_percent, 100);
    assert.ok(Math.abs(rows[32].industry_employee_top_percent! - 100 / 33) < 1e-9);
    assert.equal(rows[34].industry_employee_top_percent, null, "small cohort hidden");
    assert.equal(rows[35].industry_employee_top_percent, null, "unknown industry hidden");
    assert.equal(rows[36].salary_top_percent, null, "zero salary excluded");
    assert.equal(rows[37].salary_top_percent, null, "missing salary excluded");
    assert.ok(Math.abs(rows[37].employee_top_percent! - 100 / 38) < 1e-9);
    assert.equal(refreshCompanyBenchmarks(db, "2026-07"), 0);
    assert.deepEqual(db.prepare("SELECT * FROM company_benchmarks ORDER BY company_id").all(), rows);
    db.exec("CREATE TRIGGER reject_benchmarks BEFORE INSERT ON company_benchmarks BEGIN SELECT RAISE(ABORT,'test'); END;");
    assert.throws(() => refreshCompanyBenchmarks(db, "2026-08"), /test/);
    assert.deepEqual(db.prepare("SELECT * FROM company_benchmarks ORDER BY company_id").all(), rows, "refresh rolls back atomically");
    db.exec(`DROP TRIGGER reject_benchmarks;
      INSERT INTO source_files (id,source_name,file_name,snapshot_month,checksum,row_count,imported_at,published_at)
        VALUES (3,'NPS','revision.csv','2026-08','three',1,'now','2026-09-24');
      INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,subscription_status_code,employee_count,monthly_billed_amount)
        VALUES (40,3,'2026-08','1',200,1900000);`);
    refreshMonthlyStatistics(db, "2026-08");
    assert.deepEqual(db.prepare("SELECT company_id,source_file_id FROM company_benchmarks").all(), [{ company_id: 40, source_file_id: 3 }]);
  } finally { db.close(); }
});
