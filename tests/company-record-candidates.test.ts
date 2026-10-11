import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { migrate } from "@/db/migrate";
import { rebuildCompanySearchIndex } from "@/lib/company-search-index";
import { findCompanyRecordCandidates } from "@/lib/company-record-candidates";

test("record candidates require matching identity hints and adjacent canonical periods", () => {
  const db = new Database(":memory:");
  try {
    migrate(db);
    db.exec(`INSERT INTO source_files (id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES (1,'test','test.csv','2020-04','a',10,'now');`);
    const company = db.prepare(`INSERT INTO companies (id,identity_key,name,normalized_name,registration_number,address,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'now','now')`);
    const snapshot = db.prepare(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,employee_count)
      VALUES (?,1,?,93)`);
    const oldName = "전국버스공제조합경기지부";
    const newName = "전국버스운송사업조합연합회공제조합경기지부";
    const add = (id: number, name: string, first: string, last: string, address: string | null = "송원로", number: string | null = "135820") => {
      company.run(id, String(id), name, name, number, address);
      snapshot.run(id, first); snapshot.run(id, last);
    };
    add(1, oldName, "2015-11", "2020-04");
    add(2, newName, "2020-05", "2026-08");
    add(3, newName, "2020-05", "2026-08", "다른 주소");
    add(4, "전혀다른회사", "2020-05", "2026-08");
    add(5, newName, "2020-04", "2026-08");
    add(6, newName, "2020-06", "2026-08");
    add(7, newName, "2020-05", "2026-08", null);
    add(8, newName, "2020-05", "2026-08", undefined, null);
    assert.deepEqual(findCompanyRecordCandidates(db, 1), [], "no FTS means no full scan");
    rebuildCompanySearchIndex(db);
    assert.deepEqual(findCompanyRecordCandidates(db, 1), [{ id: 2, name: newName, firstMonth: "2020-05", lastMonth: "2026-08", direction: "later" }]);
    assert.deepEqual(findCompanyRecordCandidates(db, 2).map((row) => [row.id, row.direction]), [[1, "earlier"]]);
    for (const id of [7, 8, 999]) assert.deepEqual(findCompanyRecordCandidates(db, id), []);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM company_snapshots WHERE company_id=1").get() as { n: number }).n, 2);
    db.exec(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,employee_count) VALUES (1,1,'2020-05',93)`);
    assert.deepEqual(findCompanyRecordCandidates(db, 1).map((row) => row.id), [6]);
    db.exec(`INSERT INTO source_files (id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES (2,'test','replacement.csv','2020-05','b',0,'now');
      INSERT INTO monthly_statistics VALUES ('2020-05',2,0,0,0,0,0,0,'[]','[]','now');`);
    assert.deepEqual(findCompanyRecordCandidates(db, 1).map((row) => row.id), []);
  } finally { db.close(); }
});
