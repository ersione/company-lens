import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { companyRelevanceKey } from "@/lib/company-relevance";
import { searchCompanies, searchCompanyPage } from "@/lib/company-queries";
import { defaultSearchOptions } from "@/lib/company-search-options";
import { rebuildCompanyLatest } from "@/lib/company-latest";
import { rebuildCompanySearchIndex } from "@/lib/company-search-index";

test("relevance strips edge legal forms and spacing without rewriting interior company words", () => {
  for(const value of ["주식회사 티빙", "（주） 티빙", "티빙(주)", "㈜티빙", "유한책임회사 티빙", "주식회사 (주) 티빙"]) {
    assert.equal(companyRelevanceKey(value),"티빙");
  }
  assert.equal(companyRelevanceKey("새주식회사연구소"),"새주식회사연구소");
  assert.equal(companyRelevanceKey("주식회사"),"주식회사");
  assert.equal(companyRelevanceKey("（유） ACME"),"acme");
});

test("employee defaults and legal-name relevance preserve matching, counts, paging and latest values", () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"lens-relevance-"));
  const saved=process.env.DATABASE_URL;
  process.env.DATABASE_URL=path.join(directory,"test.sqlite");
  const {sqlite}=createDb();
  try {
    migrate(sqlite);
    sqlite.exec(`INSERT INTO source_files(id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES(1,'test','test.csv','2026-08','a',6,'now')`);
    const names=["주식회사티빙","티빙미디어","티빙","（주） 티빙","티빙(주)","티빙스튜디오"];
    const counts=[10,1000,5,20,15,null];
    for(const [i,name] of names.entries()) {
      sqlite.prepare(`INSERT INTO companies(id,identity_key,name,normalized_name,created_at,updated_at)
        VALUES(?,?,?,?,'now','now')`).run(i+1,String(i),name,name);
      sqlite.prepare(`INSERT INTO company_snapshots(company_id,source_file_id,snapshot_month,employee_count)
        VALUES(?,1,'2026-08',?)`).run(i+1,counts[i]);
    }
    sqlite.exec(`INSERT INTO company_snapshots(company_id,source_file_id,snapshot_month,employee_count)
      VALUES(1,1,'2026-07',99999)`);
    rebuildCompanySearchIndex(sqlite);
    const check=()=>{
      assert.deepEqual(searchCompanies("티빙").map(row=>row.id),[2,4,5,1,3,6]);
      assert.deepEqual(searchCompanies("티빙",20,{sort:"relevance"}).map(row=>row.id),[4,5,1,3,2,6]);
      const options={...defaultSearchOptions,sort:"relevance" as const};
      assert.deepEqual(searchCompanyPage("티빙",options,2).results.map(row=>row.id),[4,5]);
      const second=searchCompanyPage("티빙",{...options,page:2},2);
      assert.deepEqual(second.results.map(row=>row.id),[1,3]);
      assert.equal(second.totalCount,6);
      assert.equal(second.totalPages,3);
      assert.deepEqual(searchCompanies("주식회사티빙",20,{sort:"relevance"}).map(row=>row.id),[1]);
      assert.deepEqual(searchCompanies("티빙",20,{minEmployees:15}).map(row=>row.id),[2,4,5]);
    };
    check();
    rebuildCompanyLatest(sqlite);
    check();
    const plan=sqlite.prepare(`EXPLAIN QUERY PLAN SELECT company_id FROM company_latest
      WHERE employee_count>=? ORDER BY employee_count DESC,snapshot_month DESC,company_id LIMIT 20`).all(15) as {detail:string}[];
    assert.ok(plan.some(row=>row.detail.includes("company_latest_employees_idx")));
    assert.ok(plan.every(row=>!row.detail.includes("TEMP B-TREE")));
  } finally {
    sqlite.close();
    if(saved===undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL=saved;
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
