import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { searchCompanyPage } from "@/lib/company-queries";
import { defaultSearchOptions } from "@/lib/company-search-options";
import { shortSearchMatch, shortSearchTokens, rebuildCompanyShortSearchIndex, hasShortSearchIndex } from "@/lib/company-short-search";

test("short index preserves substring results, counts, filters and SQL-triggered changes", () => {
  const saved = process.env.DATABASE_URL;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lens-short-search-"));
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const { sqlite } = createDb();
  try {
    migrate(sqlite);
    sqlite.exec(`INSERT INTO source_files(id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES(1,'test','current.csv','2026-08','current',6,'now')`);
    const insert = sqlite.prepare(`INSERT INTO companies(id,identity_key,name,normalized_name,registration_number,address,created_at,updated_at)
      VALUES(?,?,?,?,?,?,'now','now')`);
    for (const [i, name] of ["주식회사티빙", "티빙미디어", "회사티서울빙", "ABCD", "𠮷𠮷상사", "아éB회사"].entries()) {
      insert.run(i+1, String(i), name, name.toLocaleLowerCase("ko-KR"), "1234567890", i ? "경기도 수원시" : "서울특별시 마포구");
      sqlite.prepare(`INSERT INTO company_snapshots(company_id,source_file_id,snapshot_month,employee_count)
        VALUES(?,1,'2026-08',10)`).run(i+1);
    }
    const queries = ["티빙", "회사", "AB", "𠮷𠮷", "éB", "12", "1-2", "티서울", "없는"];
    const baseline = queries.map((query) => searchCompanyPage(query, defaultSearchOptions, 1));
    rebuildCompanyShortSearchIndex(sqlite);
    assert.deepEqual(queries.map((query) => searchCompanyPage(query, defaultSearchOptions, 1)), baseline);
    assert.equal(searchCompanyPage("티빙", { ...defaultSearchOptions, region: "서울특별시" }).totalCount, 1);
    assert.equal(searchCompanyPage("티빙", { ...defaultSearchOptions, page: 2 }, 1).results[0].name, "티빙미디어");
    const plan = sqlite.prepare(`EXPLAIN QUERY PLAN SELECT f.rowid FROM company_short_search f
      CROSS JOIN companies c ON c.id=f.rowid WHERE company_short_search MATCH ?
      AND (c.normalized_name LIKE ? OR c.name LIKE ? OR (?!='' AND c.registration_number LIKE ?))`)
      .all(shortSearchMatch("티빙", ""), "%티빙%", "%티빙%", "", "%%") as { detail: string }[];
    assert.ok(plan.some((row) => row.detail.includes("VIRTUAL TABLE INDEX")));
    assert.ok(plan.some((row) => row.detail.includes("INTEGER PRIMARY KEY")));
    assert.ok(!plan.some((row) => row.detail.includes("companies_search_covering_idx")));
    const match = sqlite.prepare("SELECT rowid AS id FROM company_short_search WHERE company_short_search MATCH ? ORDER BY rowid");
    assert.deepEqual(match.all(shortSearchMatch("티빙", "")), [{ id: 1 }, { id: 2 }]);
    sqlite.exec("UPDATE companies SET name='주식회사왓챠',normalized_name='주식회사왓챠' WHERE id=1");
    assert.deepEqual(match.all(shortSearchMatch("티빙", "")), [{ id: 2 }]);
    assert.deepEqual(match.all(shortSearchMatch("왓챠", "")), [{ id: 1 }]);
    sqlite.exec("DELETE FROM companies WHERE id=2");
    assert.deepEqual(match.all(shortSearchMatch("티빙", "")), []);
    insert.run(7, "new", "티빙", "티빙", "99", null);
    assert.deepEqual(match.all(shortSearchMatch("티빙", "")), [{ id: 7 }]);
    assert.deepEqual(match.all(shortSearchMatch("99", "99")), [{ id: 7 }]);
    // Compare trigger-generated terms with the bulk builder, including Unicode and nulls.
    const terms = match.all(shortSearchMatch("éB", ""));
    sqlite.exec("UPDATE companies SET name='아éB회사!',normalized_name='아éb회사!' WHERE id=6");
    assert.deepEqual(match.all(shortSearchMatch("éB", "")), terms);
    rebuildCompanyShortSearchIndex(sqlite);
    assert.deepEqual(match.all(shortSearchMatch("éB", "")), terms);
    assert.throws(() => rebuildCompanyShortSearchIndex(sqlite, () => { throw new Error("abort build"); }), /abort build/);
    assert.equal(hasShortSearchIndex(sqlite), true);
    assert.deepEqual(match.all(shortSearchMatch("티빙", "")), [{ id: 7 }]);
  } finally {
    sqlite.close();
    if (saved === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = saved;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("short search tokens are bounded hex terms rather than executable FTS syntax", () => {
  assert.equal(shortSearchTokens("AA", "aa", null), "b6161");
  assert.match(shortSearchTokens('"*'), /^b[0-9a-f]+$/);
  assert.equal(shortSearchMatch("가", ""), undefined);
  assert.equal(shortSearchMatch("삼성전자", ""), undefined);
});
