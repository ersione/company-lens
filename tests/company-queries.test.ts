import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { getCompanyDetail, searchCompanies, searchCompanyPage, searchCompanySuggestions } from "@/lib/company-queries";
import { maxSearchCandidates, SearchTooBroadError } from "@/lib/company-search-guard";
import { apiResponse, searchApi } from "@/lib/company-api";
import { defaultSearchOptions } from "@/lib/company-search-options";
import { rebuildCompanySearchIndex, searchIndexMatch } from "@/lib/company-search-index";
import { rebuildCompanyLatest } from "@/lib/company-latest";

test("recent daily-worker zero counts are hidden but positive, unknown and ordinary names remain", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-daily-"));
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const { sqlite } = createDb();
  try {
    migrate(sqlite);
    sqlite.exec(`INSERT INTO source_files (id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES (1,'test','latest.csv','2026-08','a',12,'now');`);
    const insert = sqlite.prepare(`INSERT INTO companies (id,identity_key,name,normalized_name,created_at,updated_at)
      VALUES (?,?,?,?,'now','now')`);
    const snapshot = sqlite.prepare(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,employee_count)
      VALUES (?,1,'2026-08',?)`);
    const rows: [string, number | null][] = [
      ['테스트회사(일용) 공사',0], ['테스트회사/일용/공사',0], ['테스트회사-일용-공사',0],
      ['테스트회사（일용）공사',0], ['테스트회사[일용]공사',0], ['테스트회사(일용) 공사',4],
      ['테스트회사/일용/공사',null], ['테스트회사',0], ['테스트회사일용품판매',0],
      ['테스트회사(일용직) 공사',0], ['테스트회사(일용직) 공사',4], ['테스트회사(일용품)판매',0]
    ];
    rows.forEach(([name, count], i) => { insert.run(i+1, String(i), name, name); snapshot.run(i+1, count); });
    sqlite.exec(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,employee_count)
      VALUES (8,1,'2026-07',3),(9,1,'2026-07',3),(12,1,'2026-07',3)`);
    const check = () => {
      assert.deepEqual(searchCompanies('테스트회사').map((row) => row.id).sort((a,b) => a-b), [6,7,8,9,11,12]);
      assert.equal(searchCompanies('', 20).length, 6);
      const page = searchCompanyPage('테스트회사', defaultSearchOptions, 3);
      assert.equal(page.results.length, 3);
      assert.equal(page.hasMore, true);
      const next = searchCompanyPage('테스트회사', { ...defaultSearchOptions, page: 2 }, 3);
      assert.equal(next.results.length, 3);
      assert.equal(next.hasMore, false);
      assert.equal(getCompanyDetail(1)?.employeeCount, 0);
    };
    check(); rebuildCompanySearchIndex(sqlite); check(); rebuildCompanyLatest(sqlite); check();
  } finally {
    sqlite.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("single-month zero counts are hidden across search paths, counting canonical months rather than revisions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-single-"));
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const { sqlite } = createDb();
  try {
    migrate(sqlite);
    sqlite.exec(`INSERT INTO source_files (id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES (1,'test','latest.csv','2026-08','a',8,'now'),(2,'test','revision.csv','2026-08','b',8,'now');
      INSERT INTO monthly_statistics VALUES ('2026-08',1,0,0,0,0,0,0,'[]','[]','now');`);
    const company = sqlite.prepare(`INSERT INTO companies (id,identity_key,name,normalized_name,address,created_at,updated_at)
      VALUES (?,?,?,?,'서울특별시','now','now')`);
    for (let id = 1; id <= 6; id++) company.run(id, String(id), `Single ${id}`, `single ${id}`);
    sqlite.exec(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,employee_count) VALUES
      (1,1,'2026-08',0), (2,1,'2026-08',0), (2,1,'2026-07',5),
      (3,1,'2026-08',5), (4,1,'2026-08',NULL),
      (5,1,'2026-08',0), (5,2,'2026-08',3),
      (6,1,'2026-08',0), (6,2,'2026-07',4);
      INSERT INTO monthly_statistics VALUES ('2026-07',1,0,0,0,0,0,0,'[]','[]','now');`);
    const check = () => {
      assert.deepEqual(searchCompanies('Single').map(row => row.id), [3,2,4]);
      assert.equal(searchCompanies('', 20).length, 3);
      assert.deepEqual(searchCompanies('Single 1'), []);
      assert.deepEqual(searchCompanySuggestions('Single 1'), []);
      assert.deepEqual(searchCompanies('Sin', 1).map(row => row.id), [3]);
      const first = searchCompanyPage('Single', defaultSearchOptions, 2);
      assert.equal(first.totalCount, 3);
      assert.equal(first.totalPages, 2);
      assert.deepEqual(first.results.map(row => row.id), [3,2]);
      assert.equal(first.hasMore, true);
      const next = searchCompanyPage('Single', { ...defaultSearchOptions, page: 2 }, 2);
      assert.equal(next.totalCount, first.totalCount);
      assert.equal(next.totalPages, first.totalPages);
      assert.deepEqual(next.results.map(row => row.id), [4]);
      assert.equal(next.hasMore, false);
      const beyond = searchCompanyPage('Single', { ...defaultSearchOptions, page: 3 }, 2);
      assert.deepEqual(beyond.results, []);
      assert.equal(beyond.totalCount, 3);
      assert.equal(beyond.hasMore, false);
      const filtered = searchCompanyPage('Single', { ...defaultSearchOptions, region: '서울특별시', minEmployees: 1, sort: 'employees' }, 2);
      assert.equal(filtered.totalCount, 1);
      assert.equal(filtered.totalPages, 1);
      const empty = searchCompanyPage('Single 1', defaultSearchOptions, 2);
      assert.equal(empty.totalCount, 0);
      assert.equal(empty.totalPages, 0);
      assert.equal(empty.hasMore, false);
      assert.deepEqual(searchCompanies('Single', 20, { region: '서울특별시', sort: 'employees' }).map(row => row.id), [3,2,4]);
      assert.equal(getCompanyDetail(1)?.employeeCount, 0);
    };
    check(); rebuildCompanySearchIndex(sqlite); check(); rebuildCompanyLatest(sqlite); check();
  } finally {
    sqlite.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("broad searches stop before snapshot joins and return actionable web/API errors", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-broad-"));
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const { sqlite } = createDb();
  try {
    migrate(sqlite);
    const insert = sqlite.prepare(`INSERT INTO companies (identity_key,name,normalized_name,created_at,updated_at)
      VALUES (?,'(일용) 테스트회사','(일용) 테스트회사','now','now')`);
    sqlite.transaction(() => { for (let i = 0; i < maxSearchCandidates; i++) insert.run(String(i)); })();
    rebuildCompanySearchIndex(sqlite);
    assert.equal(searchCompanies("(일용", 1).length, 1, "exact cap remains searchable");
    insert.run(String(maxSearchCandidates));
    assert.throws(() => searchCompanies("(일용", 1), SearchTooBroadError);
    assert.throws(() => searchCompanyPage("(일용", { ...defaultSearchOptions, region: "서울특별시", page: 2 }), SearchTooBroadError);
    assert.deepEqual(searchCompanySuggestions("(일용"), [], "optional suggestions cannot break details");
    const response = apiResponse(() => searchApi(new Request("http://localhost/api/v1/companies?q=%28%EC%9D%BC%EC%9A%A9")));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.json();
    assert.equal(body.error.code, "INVALID_REQUEST");
    assert.match(body.error.message, /더 구체적으로/);
    assert.deepEqual(searchCompanies("없는회사"), []);
  } finally {
    sqlite.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("search hides stale zero-subscriber records before pagination without deleting history", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-visibility-"));
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const { sqlite } = createDb();
  try {
    migrate(sqlite);
    sqlite.exec(`INSERT INTO source_files (id,source_name,file_name,snapshot_month,checksum,row_count,imported_at)
      VALUES (1,'test','latest.csv','2026-08','a',7,'now');`);
    const insertCompany = sqlite.prepare(`INSERT INTO companies (id,identity_key,name,normalized_name,address,created_at,updated_at)
      VALUES (?,?,?,?,'서울특별시','now','now')`);
    const insertSnapshot = sqlite.prepare(`INSERT INTO company_snapshots (company_id,source_file_id,snapshot_month,employee_count)
      VALUES (?,1,?,?)`);
    const rows: [string | null, number | null][] = [
      ['2018-01',0], ['2025-08',0], ['2025-09',0], ['2018-01',5], ['2018-01',null], [null,null], ['2026-08',10]
    ];
    rows.forEach(([month, count], i) => {
      insertCompany.run(i + 1, String(i), `Alpha ${i + 1}`, `alpha ${i + 1}`);
      if (month) insertSnapshot.run(i + 1, month, count);
    });
    insertSnapshot.run(3, '2025-08', 3);
    const check = () => {
      assert.deepEqual(searchCompanies("Alpha", 20).map((row) => row.id), [7,4,3,5,6]);
      assert.deepEqual(searchCompanies("Alpha 1"), []);
      assert.equal(getCompanyDetail(1)?.employeeCount, 0);
      assert.equal(getCompanyDetail(1)?.snapshotMonth, "2018-01");
      assert.equal(searchCompanies("", 20).length, 5);
      const first = searchCompanyPage("Alpha", defaultSearchOptions, 3);
      assert.deepEqual(first.results.map((row) => row.id), [7,4,3]);
      assert.equal(first.hasMore, true);
      const second = searchCompanyPage("Alpha", { ...defaultSearchOptions, page: 2 }, 3);
      assert.deepEqual(second.results.map((row) => row.id), [5,6]);
      assert.equal(second.hasMore, false);
      assert.deepEqual(searchCompanies("Al", 1).map((row) => row.id), [7], "short-prefix shortcut also filters before limiting");
      assert.deepEqual(searchCompanies("Alpha", 20, { sort: "employees", minEmployees: 1, region: "서울특별시" }).map((row) => row.id), [7,4]);
    };
    check();
    rebuildCompanySearchIndex(sqlite);
    check();
    rebuildCompanyLatest(sqlite);
    check();
    sqlite.exec(`INSERT INTO monthly_statistics VALUES ('2026-09',1,0,0,0,0,0,0,'[]','[]','now');`);
    assert.equal(searchCompanies("Alpha 3").length, 0, "cutoff advances with dataset month, not wall clock");
    assert.equal(getCompanyDetail(3)?.employeeCount, 0);
    sqlite.exec("DELETE FROM company_latest_state; DELETE FROM company_latest; DELETE FROM monthly_statistics; DELETE FROM company_snapshots; DELETE FROM source_files;");
    assert.equal(searchCompanies("Alpha", 20).length, 7, "unknown dataset month does not suppress records");
  } finally {
    sqlite.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("name search excludes unrelated registered companies and returns latest snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-query-"));
  const databasePath = path.join(directory, "test.sqlite");
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databasePath;
  const client = createDb();
  try {
    migrate(client.sqlite);
    client.sqlite.exec(`
      INSERT INTO companies (identity_key, registration_number, name, normalized_name, created_at, updated_at)
      VALUES ('a', '1234567890', 'Alpha', 'alpha', 'now', 'now'),
             ('b', '9876543210', 'Beta', 'beta', 'now', 'now');
      INSERT INTO source_files (source_name, file_name, snapshot_month, checksum, row_count, imported_at)
      VALUES ('test', 'test.csv', '2025-02', 'test', 2, 'now');
      INSERT INTO company_snapshots (company_id, source_file_id, snapshot_month, employee_count)
      VALUES (1, 1, '2025-01', 10), (1, 1, '2025-02', 20);
    `);
    assert.deepEqual(searchCompanies("Alpha").map((company) => company.name), ["Alpha"]);
    assert.equal(searchCompanies("Alpha")[0].employeeCount, 20);
    assert.equal(searchCompanies("missing").length, 0);
    assert.equal(searchCompanies("987-65")[0].name, "Beta");
    assert.equal(getCompanyDetail(1)?.address, null);
    assert.equal(getCompanyDetail(1)?.industry, null);
    assert.equal(getCompanyDetail(999), undefined);
    client.sqlite.exec(`
      INSERT INTO companies (identity_key, registration_number, name, normalized_name, created_at, updated_at)
      VALUES ('c', '555555', '(Contractor) Alpha construction', '(contractor) alpha construction', 'now', 'now'),
             ('d', '123456', 'Alpha Ltd', 'alpha ltd', 'now', 'now');
    `);
    assert.deepEqual(searchCompanies("Alpha", 2).map((company) => company.name), ["Alpha", "Alpha Ltd"]);
    assert.equal(searchCompanies("Missing123").length, 0);
    assert.deepEqual(searchCompanies("", 3).map((company) => company.name), ["Alpha", "(Contractor) Alpha construction", "Alpha Ltd"]);
    client.sqlite.exec(`
      INSERT INTO source_files (source_name, file_name, snapshot_month, checksum, row_count, imported_at)
      VALUES ('test', 'revision.csv', '2025-02', 'revision', 1, 'now');
      INSERT INTO company_snapshots (company_id, source_file_id, snapshot_month, employee_count)
      VALUES (2, 1, '2025-03', 30), (1, 2, '2025-02', 25);
    `);
    assert.equal(getCompanyDetail(1)?.employeeCount, 25);
    assert.deepEqual(searchCompanies("", 5).map((company) => company.name), ["Beta", "Alpha", "(Contractor) Alpha construction", "Alpha Ltd"]);
    const plan = client.sqlite.prepare(`EXPLAIN QUERY PLAN SELECT id FROM company_snapshots
      WHERE company_id = ? ORDER BY snapshot_month DESC, id DESC LIMIT 1`).all(1) as { detail: string }[];
    assert.ok(plan.some(({ detail }) => detail.includes("company_snapshots_latest_idx")));
    assert.ok(plan.every(({ detail }) => !detail.includes("TEMP B-TREE")));
    const expected = searchCompanies("Alpha");
    rebuildCompanySearchIndex(client.sqlite);
    assert.deepEqual(searchCompanies("Alpha"), expected);
    assert.equal(searchCompanies("pha").length, 3);
    assert.equal(searchCompanies("987-65")[0].name, "Beta");
    assert.equal(searchCompanies("Al").length, 3);
    assert.equal(searchCompanies("Al", 1)[0].name, "Alpha");
    assert.equal(searchCompanies('" OR *').length, 0);
    client.sqlite.exec(`UPDATE companies SET name = 'Gamma', normalized_name = 'gamma' WHERE id = 2`);
    assert.equal(searchCompanies("Beta").length, 0);
    assert.equal(searchCompanies("Gamma")[0].id, 2);
    client.sqlite.exec(`DELETE FROM companies WHERE id = 3`);
    assert.equal(searchCompanies("construction").length, 0);
    client.sqlite.exec(`INSERT INTO companies (identity_key, name, normalized_name, created_at, updated_at)
      VALUES ('new', '새로운테스트회사', '새로운테스트회사', 'now', 'now')`);
    assert.equal(searchCompanies("테스트")[0].name, "새로운테스트회사");
    assert.equal(searchIndexMatch("회사", ""), undefined);
    const searchPlan = client.sqlite.prepare(`EXPLAIN QUERY PLAN SELECT rowid FROM company_search WHERE company_search MATCH ?`)
      .all(searchIndexMatch("Alpha", "")) as { detail: string }[];
    assert.ok(searchPlan.some(({ detail }) => detail.includes("VIRTUAL TABLE INDEX")));
    const queries = ["Alpha", "테스트", "987-65", "Al", "missing"];
    const fallback = queries.map((query) => searchCompanies(query));
    rebuildCompanyLatest(client.sqlite);
    assert.deepEqual(queries.map((query) => searchCompanies(query)), fallback);
  } finally {
    client.sqlite.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("filtered pages use canonical latest snapshots, stable ordering, and legacy region names", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-filter-"));
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = path.join(directory, "test.sqlite");
  const client = createDb();
  try {
    migrate(client.sqlite);
    client.sqlite.exec(`
      INSERT INTO source_files (id, source_name, file_name, snapshot_month, checksum, row_count, imported_at)
      VALUES (1, 'test', 'canonical.csv', '2026-08', 'a', 45, 'now'), (2, 'test', 'older-revision.csv', '2026-08', 'b', 1, 'now');
      INSERT INTO monthly_statistics (snapshot_month, source_file_id, workplace_count, active_workplace_count, subscriber_count,
        unknown_employee_count, new_joiners, departures, industry_distribution, size_distribution, generated_at)
      VALUES ('2026-08', 1, 45, 45, 1000, 0, 0, 0, '[]', '[]', 'now');
    `);
    const insertCompany = client.sqlite.prepare(`INSERT INTO companies (id, identity_key, name, normalized_name, address, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'now', 'now')`);
    const insertSnapshot = client.sqlite.prepare(`INSERT INTO company_snapshots (company_id, source_file_id, snapshot_month, employee_count)
      VALUES (?, ?, ?, ?)`);
    for (let id = 1; id <= 45; id++) {
      const name = `테스트회사 ${String(id).padStart(2, "0")}`;
      const address = id <= 25 ? "서울특별시 강남구" : id <= 35 ? "경기도 수원시" : id <= 40 ? "강원도 춘천시" : "전라북도 전주시";
      insertCompany.run(id, String(id), name, name, address);
      insertSnapshot.run(id, 1, "2026-08", id * 10);
    }
    insertSnapshot.run(1, 1, "2026-07", 99999);
    insertSnapshot.run(1, 2, "2026-08", 99999);
    rebuildCompanySearchIndex(client.sqlite);
    const options = { ...defaultSearchOptions, sort: "employees" as const };
    const first = searchCompanyPage("테스트회사", options);
    const second = searchCompanyPage("테스트회사", { ...options, page: 2 });
    const third = searchCompanyPage("테스트회사", { ...options, page: 3 });
    for (const page of [first, second, third]) {
      assert.equal(page.totalCount, 45, "superseded source rows do not inflate workplace totals");
      assert.equal(page.totalPages, 3);
    }
    assert.equal(first.hasMore, true);
    assert.equal(second.hasMore, true);
    assert.equal(third.hasMore, false);
    const all = [...first.results, ...second.results, ...third.results];
    assert.equal(new Set(all.map((row) => row.id)).size, 45);
    assert.deepEqual(all.map((row) => row.id), Array.from({ length: 45 }, (_, index) => 45 - index));
    const filtered = searchCompanyPage("테스트회사", { ...options, region: "서울특별시", minEmployees: 200 }, 5);
    assert.deepEqual(filtered.results.map((row) => row.id), [25, 24, 23, 22, 21]);
    assert.equal(filtered.hasMore, true);
    assert.equal(filtered.totalCount, 6);
    assert.equal(filtered.totalPages, 2);
    assert.deepEqual(searchCompanyPage("테스트회사", { ...options, region: "서울특별시", minEmployees: 200, page: 2 }, 5).results.map((row) => row.id), [20]);
    assert.equal(searchCompanyPage("테스트회사", { ...options, region: "강원특별자치도" }).results.length, 5);
    assert.equal(searchCompanyPage("테스트회사", { ...options, region: "전북특별자치도" }).results.length, 5);
    assert.equal(searchCompanyPage("테스트회사", { ...options, minEmployees: 1000 }).results.length, 0);
    client.sqlite.exec("UPDATE company_snapshots SET employee_count = 100 WHERE company_id = 2");
    const tied = searchCompanyPage("테스트회사", defaultSearchOptions, 50).results.filter((row) => [2, 10].includes(row.id));
    assert.deepEqual(tied.map((row) => row.id), [2, 10]);
    assert.deepEqual(searchCompanyPage("테스트회사", { ...options, page: 1000 }).results, []);
    const cases = [defaultSearchOptions, options, { ...options, page: 2 },
      { ...options, region: "서울특별시", minEmployees: 200 },
      { ...options, region: "강원특별자치도" }, { ...options, region: "전북특별자치도" }];
    const before = cases.map((item) => searchCompanyPage("테스트회사", item));
    assert.equal(rebuildCompanyLatest(client.sqlite), 45);
    assert.deepEqual(cases.map((item) => searchCompanyPage("테스트회사", item)), before);
    assert.deepEqual(searchCompanies("없는회사"), []);
    const plan = client.sqlite.prepare(`EXPLAIN QUERY PLAN SELECT c.id, s.employee_count
      FROM company_search f JOIN companies c ON c.id = f.rowid
      LEFT JOIN company_latest s ON s.company_id = c.id WHERE company_search MATCH ?`)
      .all(searchIndexMatch("테스트회사", "")) as { detail: string }[];
    assert.ok(plan.some(({ detail }) => detail.includes("VIRTUAL TABLE INDEX")));
    assert.ok(plan.some(({ detail }) => detail.includes("SEARCH s USING INTEGER PRIMARY KEY")));
    assert.ok(plan.every(({ detail }) => !detail.includes("company_snapshots")));
  } finally {
    client.sqlite.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
