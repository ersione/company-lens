import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { searchCompanyPage, getCompanyDetail, getCompanyHistory } from "@/lib/company-queries";
import { defaultSearchOptions } from "@/lib/company-search-options";
import { rebuildCompanyLatest } from "@/lib/company-latest";
import { rebuildCompanySearchIndex } from "@/lib/company-search-index";
import { refreshMonthlyStatistics } from "@/lib/monthly-statistics";

test("current-only search honors canonical latest month without losing historical detail", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lens-current-search-"));
  const saved = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const { sqlite } = createDb();
  try {
    migrate(sqlite);
    sqlite.exec(`INSERT INTO source_files(id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES(1,'test','old.csv','2025-07','old',1,'now'),
        (2,'test','replaced.csv','2026-08','replaced',2,'now'),
        (3,'test','current.csv','2026-08','current',1,'now');
      INSERT INTO companies(id,identity_key,name,normalized_name,created_at,updated_at)
      VALUES(1,'current','국민은행','국민은행','now','now'),
        (2,'old','국민은행 사옥공사','국민은행 사옥공사','now','now'),
        (3,'unknown','국민은행 미관측','국민은행 미관측','now','now');
      INSERT INTO company_snapshots(company_id,source_file_id,snapshot_month,employee_count)
      VALUES(2,1,'2025-07',100),(2,2,'2026-08',150),(1,3,'2026-08',20);`);
    refreshMonthlyStatistics(sqlite, "2026-08");
    rebuildCompanySearchIndex(sqlite);
    const check = () => {
      const current = searchCompanyPage("국민은행", defaultSearchOptions, 1);
      assert.equal(current.totalCount, 1);
      assert.equal(current.totalPages, 1);
      assert.deepEqual(current.results.map(row => row.id), [1]);
      const all = { ...defaultSearchOptions, includeHistory: true };
      assert.equal(searchCompanyPage("국민은행", all, 1).totalCount, 3);
      assert.deepEqual(searchCompanyPage("국민은행", all, 1).results.map(row => row.id), [2]);
      assert.deepEqual(searchCompanyPage("국민은행", { ...all, page: 2 }, 1).results.map(row => row.id), [1]);
      assert.equal(searchCompanyPage("국민은행", { ...all, minEmployees: 50 }).totalCount, 1);
      assert.equal(searchCompanyPage("국민은행", { ...defaultSearchOptions, minEmployees: 50 }).totalCount, 0);
      assert.equal(getCompanyDetail(2)?.snapshotMonth, "2025-07");
      assert.deepEqual(getCompanyHistory(2).map(row => row.snapshotMonth), ["2025-07"]);
    };
    check();
    rebuildCompanyLatest(sqlite);
    check();
    const plan = sqlite.prepare(`EXPLAIN QUERY PLAN WITH matches AS MATERIALIZED (
      SELECT rowid AS id FROM company_search WHERE company_search MATCH ?)
      SELECT c.id FROM matches matched CROSS JOIN companies c ON c.id=matched.id
      CROSS JOIN company_latest s ON s.company_id=c.id WHERE s.snapshot_month=?
      ORDER BY s.employee_count DESC,s.snapshot_month DESC,c.name,c.id LIMIT 20`)
      .all('"국민은행"', "2026-08") as { detail: string }[];
    assert.ok(plan.some(row => row.detail.includes("SEARCH s USING INTEGER PRIMARY KEY")));
    assert.ok(plan.every(row => !row.detail.includes("company_latest_employees_idx")));
    sqlite.exec(`INSERT INTO source_files(id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES(4,'test','next.csv','2026-09','next',1,'now');
      INSERT INTO company_snapshots(company_id,source_file_id,snapshot_month,employee_count)
      VALUES(2,4,'2026-09',30);`);
    refreshMonthlyStatistics(sqlite, "2026-09");
    assert.deepEqual(searchCompanyPage("국민은행", defaultSearchOptions).results.map(row => row.id), [2]);
  } finally {
    sqlite.close();
    if (saved === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
