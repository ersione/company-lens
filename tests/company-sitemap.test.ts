import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import { companySitemapShards, companySitemapRows, companySitemapXml } from "../lib/company-sitemap";

test("company sitemaps select current workplaces at the 50-subscriber boundary and stable ID ranges", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE company_latest_state(id INTEGER); INSERT INTO company_latest_state VALUES(1);
      CREATE TABLE companies(id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE monthly_statistics(snapshot_month TEXT); INSERT INTO monthly_statistics VALUES('2026-08');
      CREATE TABLE source_files(id INTEGER PRIMARY KEY, snapshot_month TEXT, imported_at TEXT);
      INSERT INTO source_files VALUES(1,'2026-08','2026-10-12T00:00:00.000Z');
      CREATE TABLE company_latest(company_id INTEGER PRIMARY KEY, source_file_id INTEGER, snapshot_month TEXT, employee_count INTEGER);
      INSERT INTO companies VALUES(1,'최소'),(10000,'구간끝'),(10001,'다음구간'),(2,'미달'),(3,'과거'),(4,'누락'),(5,' ');
      INSERT INTO company_latest VALUES(1,1,'2026-08',50),(10000,1,'2026-08',100),(10001,1,'2026-08',70),
        (2,1,'2026-08',49),(3,1,'2026-07',1000),(4,1,'2026-08',NULL),(5,1,'2026-08',99);`);
    assert.deepEqual(companySitemapShards(db), [0, 1]);
    assert.deepEqual(companySitemapRows(db, 0).map(row => row.id), [1, 10000]);
    assert.deepEqual(companySitemapRows(db, 1).map(row => row.id), [10001]);
    for (const shard of [-1, 0.5, Number.MAX_SAFE_INTEGER, NaN, 2]) assert.deepEqual(companySitemapRows(db, shard), []);
    const xml = companySitemapXml(companySitemapRows(db, 0));
    assert.match(xml, /<lastmod>2026-10-12T00:00:00.000Z<\/lastmod>/);
    assert.ok(!xml.includes('최소'));
    assert.ok(!companySitemapXml([{ id: 1, modified: '</lastmod><script>' }]).includes('<script>'));
    db.exec('DELETE FROM company_latest_state');
    assert.deepEqual(companySitemapShards(db), []);
    assert.deepEqual(companySitemapRows(db, 0), []);
  } finally { db.close(); }
});
