import type Database from "better-sqlite3";

export const canonicalSnapshotSql = `(NOT EXISTS (SELECT 1 FROM monthly_statistics m WHERE m.snapshot_month = s2.snapshot_month)
  OR s2.source_file_id = (SELECT m.source_file_id FROM monthly_statistics m WHERE m.snapshot_month = s2.snapshot_month))`;

export function hasCompanyLatest(sqlite: Database.Database) {
  return Boolean(sqlite.prepare("SELECT 1 FROM company_latest_state WHERE id = 1").get());
}

export function provisionCompanyEmployeeIndex(sqlite: Database.Database) {
  sqlite.exec(`CREATE INDEX IF NOT EXISTS company_latest_employees_idx
    ON company_latest(employee_count DESC, snapshot_month DESC, company_id);`);
}

function insertLatest(sqlite: Database.Database, candidates: string) {
  sqlite.exec(`INSERT INTO company_latest (company_id, snapshot_id, source_file_id, snapshot_month,
      employee_count, monthly_billed_amount, new_joiners, departures)
    SELECT c.id, s.id, s.source_file_id, s.snapshot_month, s.employee_count,
      s.monthly_billed_amount, s.new_joiners, s.departures
    FROM (${candidates}) c JOIN company_snapshots s ON s.id = (
      SELECT s2.id FROM company_snapshots s2
      WHERE s2.company_id = c.id AND ${canonicalSnapshotSql}
      ORDER BY s2.snapshot_month DESC, s2.id DESC LIMIT 1
    )`);
  return (sqlite.prepare("SELECT changes() AS count").get() as { count: number }).count;
}

export function rebuildCompanyLatest(sqlite: Database.Database, onProgress?: (rows: number) => void) {
  return sqlite.transaction(() => {
    sqlite.exec("DELETE FROM company_latest;");
    provisionCompanyEmployeeIndex(sqlite);
    const next = sqlite.prepare(`SELECT MAX(id) AS last FROM (
      SELECT id FROM companies WHERE id > ? ORDER BY id LIMIT 100000
    )`);
    let after = 0;
    let count = 0;
    for (;;) {
      const { last } = next.get(after) as { last: number | null };
      if (last === null) break;
      // Internal integer bounds; rowid order keeps adjacent history-index pages local.
      count += insertLatest(sqlite, `SELECT id FROM companies NOT INDEXED WHERE id > ${after} AND id <= ${last}`);
      after = last;
      onProgress?.(count);
    }
    sqlite.prepare(`INSERT INTO company_latest_state (id, rebuilt_at) VALUES (1, ?)
      ON CONFLICT(id) DO UPDATE SET rebuilt_at = excluded.rebuilt_at`).run(new Date().toISOString());
    return count;
  }).immediate();
}

export function refreshCompanyLatest(sqlite: Database.Database, month: string) {
  if (!hasCompanyLatest(sqlite)) return;
  sqlite.transaction(() => {
    // Include every revision of this month: a replacement can omit a previously listed company.
    sqlite.exec("CREATE TEMP TABLE latest_affected (id INTEGER PRIMARY KEY);");
    sqlite.prepare(`INSERT INTO latest_affected SELECT DISTINCT company_id
      FROM company_snapshots WHERE snapshot_month = ?`).run(month);
    sqlite.exec("DELETE FROM company_latest WHERE company_id IN (SELECT id FROM latest_affected);");
    insertLatest(sqlite, "SELECT id FROM latest_affected");
    sqlite.exec("DROP TABLE latest_affected;");
  })();
}
