import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { dailyWorkerSql, isDailyWorkerWorkplace } from "@/lib/daily-worker";
import { pruneDailyWorkers, verifyDailyWorkerCandidate } from "@/lib/prune-daily-workers";
import { rebuildCompanySearchIndex } from "@/lib/company-search-index";
import { rebuildCompanyLatest } from "@/lib/company-latest";
import { refreshMonthlyStatistics } from "@/lib/monthly-statistics";

test("explicit daily-worker markers do not classify ordinary company names", () => {
  const db = createDb(":memory:").sqlite;
  const sql = db.prepare(`SELECT ${dailyWorkerSql("name")} AS matched FROM (SELECT ? AS name)`);
  const checkSql = (name: string) => (sql.get(name) as {matched:number}).matched;
  for (const name of ["건설(일용)현장", "건설（일용직）현장", "아트인/일용/TVING", "건설-일용-현장", "회사[일용]현장", "회사 건설일용관리", "회사-일용)현장", "회사- 일용/현장", "회사<건설일용>현장", "회사_일용_현장", "회사일용근로자", "회사 일용직"]) {
    assert.equal(isDailyWorkerWorkplace(name), true, name);
    assert.equal(checkSql(name),1,name);
  }
  for (const name of ["일용상사", "광일용접봉", "상일용역", "주식회사티빙", "일용품제조", "윤일용내과의원", "일용직업소개소", "회사(일 용)"]) {
    assert.equal(isDailyWorkerWorkplace(name), false, name);
    assert.equal(checkSql(name),0,name);
  }
  db.close();
});

test("candidate pruning removes all linked history but preserves source and ordinary companies", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lens-prune-daily-"));
  const source = path.join(directory, "source.sqlite");
  const destination = path.join(directory, "candidate.sqlite");
  const original = createDb(source);
  try {
    migrate(original.sqlite);
    original.sqlite.exec(`INSERT INTO source_files(id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES(1,'fixture','old.csv','2025-08','old',3,'now'),(2,'fixture','new.csv','2026-08','new',3,'now');`);
    for (const [id, name] of ["회사/일용/현장", "회사 건설일용관리", "일용상사"].entries()) {
      original.sqlite.prepare(`INSERT INTO companies(id,identity_key,name,normalized_name,created_at,updated_at)
        VALUES(?,?,?,?, 'now','now')`).run(id + 1, String(id), name, name);
      for (const [file, month] of [[1,"2025-08"],[2,"2026-08"]]) {
        original.sqlite.prepare(`INSERT INTO company_snapshots(company_id,source_file_id,snapshot_month,subscription_status_code,
          employee_count,monthly_billed_amount,industry) VALUES(?,?,?,'1',10,950000,'건설')`).run(id + 1,file,month);
      }
      original.sqlite.prepare("INSERT INTO company_name_observations VALUES(?,?,'2025-08','2026-08')").run(id + 1,name);
    }
    refreshMonthlyStatistics(original.sqlite,"2025-08");
    refreshMonthlyStatistics(original.sqlite,"2026-08");
    rebuildCompanyLatest(original.sqlite);
    rebuildCompanySearchIndex(original.sqlite);
    const report = await pruneDailyWorkers(source,destination,()=>{});
    assert.deepEqual(report.removed,{workplaces:2,snapshots:4});
    assert.equal(verifyDailyWorkerCandidate(source,destination,()=>{}).verification,"ok");
    assert.throws(()=>verifyDailyWorkerCandidate(source,source,()=>{}), /separate/);
    assert.equal((original.sqlite.prepare("SELECT COUNT(*) AS n FROM companies").get() as {n:number}).n,3);
    const candidate = createDb(destination);
    try {
      assert.deepEqual(candidate.sqlite.prepare("SELECT id,name FROM companies").all(),[{id:3,name:"일용상사"}]);
      assert.equal((candidate.sqlite.prepare("SELECT COUNT(*) AS n FROM company_snapshots").get() as {n:number}).n,2);
      assert.equal((candidate.sqlite.prepare("SELECT COUNT(*) AS n FROM company_latest").get() as {n:number}).n,1);
      assert.ok(candidate.sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name='company_latest_employees_idx'").get());
      assert.equal((candidate.sqlite.prepare("SELECT COUNT(*) AS n FROM company_name_observations").get() as {n:number}).n,1);
      assert.equal((candidate.sqlite.prepare("SELECT workplace_count AS n FROM monthly_statistics WHERE snapshot_month='2026-08'").get() as {n:number}).n,1);
      assert.equal((candidate.sqlite.prepare("SELECT row_count AS n FROM source_files WHERE id=2").get() as {n:number}).n,3);
      assert.equal((candidate.sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name='companies'").get() as {seq:number}).seq,3);
      assert.equal(candidate.sqlite.prepare("SELECT name FROM sqlite_master WHERE name='local_job_locks'").get(),undefined);
      assert.deepEqual(candidate.sqlite.pragma("foreign_key_check"),[]);
    } finally { candidate.sqlite.close(); }
  } finally { original.sqlite.close(); fs.rmSync(directory,{recursive:true,force:true}); }
});
