import type Database from "better-sqlite3";

export function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS source_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL,
      source_url TEXT,
      file_name TEXT NOT NULL,
      snapshot_month TEXT NOT NULL,
      checksum TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      imported_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS source_files_checksum_unique
      ON source_files (checksum);

    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_key TEXT NOT NULL,
      registration_number TEXT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      industry TEXT,
      address TEXT,
      road_address TEXT,
      lot_address TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS companies_identity_key_unique
      ON companies (identity_key);

    CREATE TABLE IF NOT EXISTS company_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      source_file_id INTEGER NOT NULL REFERENCES source_files(id) ON DELETE RESTRICT,
      snapshot_month TEXT NOT NULL,
      subscription_status_code TEXT,
      employee_count INTEGER,
      monthly_billed_amount INTEGER,
      new_joiners INTEGER,
      departures INTEGER,
      estimated_average_monthly_salary INTEGER,
      estimated_average_annual_salary INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS company_snapshots_company_month_source_unique
      ON company_snapshots (company_id, snapshot_month, source_file_id);

    CREATE INDEX IF NOT EXISTS company_snapshots_company_month_idx
      ON company_snapshots (company_id, snapshot_month DESC);

    CREATE INDEX IF NOT EXISTS company_snapshots_month_employee_idx
      ON company_snapshots (snapshot_month DESC, employee_count DESC);

    CREATE INDEX IF NOT EXISTS companies_name_idx
      ON companies (normalized_name);
  `);
}
