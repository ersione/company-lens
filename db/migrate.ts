import type Database from "better-sqlite3";

export function migrate(sqlite: Database.Database, options: { deferSnapshotIndexes?: boolean } = {}) {
  const existing = sqlite.prepare("PRAGMA table_info(company_snapshots)").all() as { name: string }[];
  if (existing.some(({ name }) => name === "created_at")) {
    throw new Error("Legacy database: run npm run db:compact before using this app version.");
  }
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
      industry TEXT
    );

    CREATE INDEX IF NOT EXISTS companies_name_idx
      ON companies (normalized_name);

    CREATE INDEX IF NOT EXISTS companies_name_order_idx
      ON companies (name, id);

    CREATE INDEX IF NOT EXISTS companies_search_covering_idx
      ON companies (normalized_name, name, registration_number);

  `);
  const companyColumns = sqlite.prepare("PRAGMA table_info(companies)").all() as { name: string }[];
  if (!companyColumns.some(({ name }) => name === "latest_snapshot_month")) {
    sqlite.exec(`ALTER TABLE companies ADD COLUMN latest_snapshot_month TEXT NOT NULL DEFAULT '';
      UPDATE companies SET latest_snapshot_month = COALESCE((SELECT MAX(snapshot_month)
        FROM company_snapshots WHERE company_id = companies.id), '');`);
  }
  const snapshotColumns = sqlite.prepare("PRAGMA table_info(company_snapshots)").all() as { name: string }[];
  if (!snapshotColumns.some(({ name }) => name === "industry")) {
    sqlite.exec(`ALTER TABLE company_snapshots ADD COLUMN industry TEXT;
      UPDATE company_snapshots SET industry = (SELECT industry FROM companies WHERE id = company_id);`);
  }
  const sourceColumns = sqlite.prepare("PRAGMA table_info(source_files)").all() as { name: string }[];
  if (!sourceColumns.some(({ name }) => name === "published_at")) {
    sqlite.exec("ALTER TABLE source_files ADD COLUMN published_at TEXT;");
  }
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS monthly_statistics (
      snapshot_month TEXT PRIMARY KEY,
      source_file_id INTEGER NOT NULL REFERENCES source_files(id),
      workplace_count INTEGER NOT NULL,
      active_workplace_count INTEGER NOT NULL,
      subscriber_count INTEGER NOT NULL,
      unknown_employee_count INTEGER NOT NULL,
      new_joiners INTEGER NOT NULL,
      departures INTEGER NOT NULL,
      industry_distribution TEXT NOT NULL,
      size_distribution TEXT NOT NULL,
      generated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS company_benchmarks (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      snapshot_month TEXT NOT NULL,
      source_file_id INTEGER NOT NULL REFERENCES source_files(id),
      employee_top_percent REAL NOT NULL,
      salary_top_percent REAL,
      industry_employee_top_percent REAL,
      industry_salary_top_percent REAL,
      employee_sample_count INTEGER NOT NULL,
      salary_sample_count INTEGER NOT NULL,
      industry_employee_sample_count INTEGER NOT NULL,
      industry_salary_sample_count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS company_latest (
      company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      snapshot_id INTEGER NOT NULL,
      source_file_id INTEGER NOT NULL REFERENCES source_files(id),
      snapshot_month TEXT NOT NULL,
      employee_count INTEGER,
      monthly_billed_amount INTEGER,
      new_joiners INTEGER,
      departures INTEGER
    );
    CREATE TABLE IF NOT EXISTS company_latest_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      rebuilt_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS industry_statistics (
      industry TEXT PRIMARY KEY,
      snapshot_month TEXT NOT NULL,
      source_file_id INTEGER NOT NULL REFERENCES source_files(id),
      employee_sample_count INTEGER NOT NULL,
      salary_sample_count INTEGER NOT NULL,
      median_employee_count REAL NOT NULL,
      median_annual_salary REAL
    );
    CREATE TABLE IF NOT EXISTS company_name_observations (
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      first_seen_month TEXT NOT NULL,
      last_seen_month TEXT NOT NULL,
      PRIMARY KEY (company_id, name)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS company_size_cohorts (
      industry TEXT NOT NULL,
      size_band INTEGER NOT NULL,
      snapshot_month TEXT NOT NULL,
      source_file_id INTEGER NOT NULL REFERENCES source_files(id),
      previous_source_file_id INTEGER REFERENCES source_files(id),
      employee_sample_count INTEGER NOT NULL,
      salary_sample_count INTEGER NOT NULL,
      growth_sample_count INTEGER NOT NULL,
      median_annual_salary REAL,
      median_employee_change_percent REAL,
      PRIMARY KEY (industry, size_band)
    ) WITHOUT ROWID;
  `);
  if (!options.deferSnapshotIndexes) createSnapshotIndexes(sqlite);
}

export function createSnapshotIndexes(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS company_snapshots_latest_idx
      ON company_snapshots(company_id, snapshot_month DESC, id DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS company_snapshots_source_idx
      ON company_snapshots(source_file_id, company_id, snapshot_month);
    CREATE INDEX IF NOT EXISTS company_snapshots_month_idx
      ON company_snapshots(snapshot_month DESC);
  `);
  if (sqlite.pragma("user_version", { simple: true }) !== 2) sqlite.pragma("user_version = 2");
}
