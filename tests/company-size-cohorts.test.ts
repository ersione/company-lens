import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { refreshMonthlyStatistics } from "@/lib/monthly-statistics";
import { getSizeCohortComparison } from "@/lib/company-queries";
import { sizeBandSql } from "@/lib/company-size-cohorts";

test("size cohorts use canonical months, independent sample thresholds and indexed lookups", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-cohorts-"));
  const oldUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const { sqlite: db } = createDb();
  try {
    migrate(db);
    db.exec(`INSERT INTO source_files (id, source_name, file_name, snapshot_month, checksum, row_count, imported_at)
      VALUES (1,'test','now.csv','2026-08','a',64,'now'), (2,'test','before.csv','2025-08','b',64,'now');`);
    const company = db.prepare(`INSERT INTO companies (id,identity_key,name,normalized_name,created_at,updated_at)
      VALUES (?, ?, ?, ?, 'now', 'now')`);
    const snapshot = db.prepare(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,
      subscription_status_code,employee_count,monthly_billed_amount,industry) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (let id = 1; id <= 65; id++) {
      company.run(id, String(id), String(id), String(id));
      const count = id <= 30 ? 20 : id <= 60 ? 60 : id <= 62 ? 5 : id === 63 ? 0 : 20;
      snapshot.run(id, 1, "2026-08", id === 64 ? "0" : "1", count, count * 95000, id === 65 ? null : "동일업종");
      snapshot.run(id, 2, "2025-08", "1", id <= 30 ? 10 : count, count * 90000, "이전업종");
    }
    refreshMonthlyStatistics(db, "2025-08");
    refreshMonthlyStatistics(db, "2026-08");
    const peer = getSizeCohortComparison(1)!;
    assert.equal(peer.sizeBand, 1);
    assert.equal(peer.employeeSampleCount, 30);
    assert.equal(peer.salarySampleCount, 30);
    assert.equal(peer.medianAnnualSalary, 12000000);
    assert.equal(peer.medianEmployeeChangePercent, 100);
    assert.equal(getSizeCohortComparison(31)!.medianEmployeeChangePercent, 0);
    for (const id of [61, 63, 64, 65, 999]) assert.equal(getSizeCohortComparison(id), undefined);
    assert.deepEqual([1, 9, 10, 49, 50, 299, 300, 999, 1000].map((n) =>
      (db.prepare(`SELECT ${sizeBandSql(String(n))} AS band`).get() as { band: number }).band), [0,0,1,1,2,2,3,3,4]);
    db.exec("UPDATE company_snapshots SET monthly_billed_amount=NULL WHERE company_id=1 AND source_file_id=1");
    refreshMonthlyStatistics(db, "2026-08");
    assert.equal(getSizeCohortComparison(1)!.medianAnnualSalary, null);
    assert.equal(getSizeCohortComparison(1)!.medianEmployeeChangePercent, 100);

    db.exec(`INSERT INTO source_files (id, source_name, file_name, snapshot_month, checksum, row_count, imported_at, published_at)
      VALUES (3,'test','revision.csv','2025-08','c',29,'now','2025-09-30');
      INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,subscription_status_code,employee_count,industry)
        SELECT company_id,3,'2025-08','1',20,industry FROM company_snapshots WHERE source_file_id=2 AND company_id < 30;`);
    refreshMonthlyStatistics(db, "2025-08");
    assert.equal(getSizeCohortComparison(2)!.growthSampleCount, 29);
    assert.equal(getSizeCohortComparison(2)!.medianEmployeeChangePercent, null, "prior-year revisions refresh latest cohorts");
    const before = db.prepare("SELECT * FROM company_size_cohorts").all();
    db.exec("CREATE TRIGGER reject_cohort BEFORE INSERT ON company_size_cohorts BEGIN SELECT RAISE(ABORT,'reject'); END");
    assert.throws(() => refreshMonthlyStatistics(db, "2026-08"), /reject/);
    assert.deepEqual(db.prepare("SELECT * FROM company_size_cohorts").all(), before, "refresh rollback preserves previous cache");
    db.exec("DROP TRIGGER reject_cohort; UPDATE monthly_statistics SET source_file_id=2 WHERE snapshot_month='2025-08'");
    assert.equal(getSizeCohortComparison(1), undefined, "stale provenance is never displayed");
  } finally {
    db.close();
    if (oldUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
