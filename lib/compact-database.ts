import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { migrate, createSnapshotIndexes } from "@/db/migrate";
import { rebuildCompanySearchIndex } from "@/lib/company-search-index";
import { estimatedMonthlySalarySql } from "@/lib/pension";
import { refreshCompanyBenchmarks } from "@/lib/company-benchmarks";

const snapshotColumns = ["id", "company_id", "source_file_id", "snapshot_month", "subscription_status_code",
  "employee_count", "monthly_billed_amount", "new_joiners", "departures", "industry"];

function finishVerification(target: Database.Database, original: Database.Database,
  source: string, destination: string, count: number, version: unknown, startedAt: string, log: (message: string) => void) {
  target.exec(`UPDATE main.sqlite_sequence SET seq = MAX(seq, COALESCE(
    (SELECT old.seq FROM legacy.sqlite_sequence old WHERE old.name = sqlite_sequence.name), 0))
    WHERE name IN ('source_files', 'companies', 'company_snapshots');
    DETACH DATABASE legacy;`);
  const latest = target.prepare("SELECT MAX(snapshot_month) AS month FROM monthly_statistics").get() as { month: string | null };
  if (latest.month) refreshCompanyBenchmarks(target, latest.month);
  // Keep repeatedly probed indexes resident during the exhaustive index check.
  target.pragma("cache_size = -2097152");
  target.pragma("mmap_size = 1073741824");
  log("Checking full-text content integrity");
  target.exec("INSERT INTO company_search(company_search, rank) VALUES ('integrity-check', 1)");
  log("Checking all database tables and index entries (2 GiB cache)");
  if (target.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Integrity check failed");
  log("Checking all foreign keys");
  if (target.prepare("PRAGMA foreign_key_check").get()) throw new Error("Foreign key check failed");
  log("Analyzing the compact database only");
  target.exec("ANALYZE main;");
  if (original.pragma("data_version", { simple: true }) !== version) throw new Error("Source changed during migration; do not replace it");
  const report = { startedAt, finishedAt: new Date().toISOString(), source, destination,
    sourceBytes: fs.statSync(source).size, destinationBytes: fs.statSync(destination).size,
    snapshots: count, integrity: "ok", foreignKeys: "ok", searchIndex: "ok", allRowsCompared: true, validationCacheMiB: 2048 };
  fs.writeFileSync(`${destination}.verified.json`, JSON.stringify(report, null, 2));
  log(JSON.stringify(report));
  return report;
}

export function verifyCompactDatabase(source: string, destination: string, log = console.log) {
  source = fs.realpathSync(source);
  destination = fs.realpathSync(destination);
  if (source === destination) throw new Error("Source and candidate must be separate files");
  fs.rmSync(`${destination}.verified.json`, { force: true });
  const original = new Database(source, { readonly: true });
  const target = new Database(destination);
  const version = original.pragma("data_version", { simple: true });
  const startedAt = new Date().toISOString();
  try {
    const columns = target.prepare("PRAGMA main.table_info(company_snapshots)").all() as { name: string }[];
    if (!columns.length || columns.some(({ name }) => name === "created_at")) throw new Error("Candidate is not compact schema");
    for (const index of ["company_snapshots_latest_idx", "company_snapshots_source_idx", "company_snapshots_month_idx"]) {
      if (!target.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?").get(index)) throw new Error(`Missing index: ${index}`);
    }
    target.pragma("cache_size = -2097152");
    target.pragma("mmap_size = 1073741824");
    target.pragma("temp_store = FILE");
    target.prepare("ATTACH DATABASE ? AS legacy").run(source);
    target.pragma("legacy.cache_size = -65536");
    for (const table of ["source_files", "companies", "monthly_statistics"]) {
      log(`Comparing every ${table} row`);
      const key = table === "monthly_statistics" ? "snapshot_month" : "id";
      const names = (target.prepare(`PRAGMA main.table_info(${table})`).all() as { name: string }[]).map(({ name }) => name);
      const difference = target.prepare(`SELECT o.${key} FROM legacy.${table} o LEFT JOIN main.${table} n ON n.${key} = o.${key}
        WHERE ${names.map((name) => `o.${name} IS NOT n.${name}`).join(" OR ")} LIMIT 1`).get();
      const counts = target.prepare(`SELECT (SELECT COUNT(*) FROM legacy.${table}) = (SELECT COUNT(*) FROM main.${table}) AS equal`).get() as { equal: number };
      if (difference || !counts.equal) throw new Error(`${table} did not match`);
    }
    const counts = target.prepare(`SELECT (SELECT COUNT(*) FROM legacy.company_snapshots) AS old,
      (SELECT COUNT(*) FROM main.company_snapshots) AS candidate`).get() as { old: number; candidate: number };
    if (counts.old !== counts.candidate) throw new Error("Snapshot count mismatch");
    const bounds = target.prepare("SELECT MIN(id) AS minimum, MAX(id) AS maximum FROM legacy.company_snapshots").get() as { minimum: number; maximum: number };
    const mismatch = target.prepare(`SELECT s.id FROM legacy.company_snapshots s LEFT JOIN main.company_snapshots n ON n.id = s.id
      WHERE s.id > ? AND s.id <= ? AND (${snapshotColumns.map((column) => `s.${column} IS NOT n.${column}`).join(" OR ")}
      OR s.estimated_average_monthly_salary IS NOT (${estimatedMonthlySalarySql("n")})
      OR s.estimated_average_annual_salary IS NOT ((${estimatedMonthlySalarySql("n")}) * 12)) LIMIT 1`);
    for (let lower = bounds.minimum - 1; lower < bounds.maximum; lower += 250_000) {
      const upper = Math.min(bounds.maximum, lower + 250_000);
      const difference = mismatch.get(lower, upper);
      if (difference) throw new Error(`Snapshot mismatch: ${JSON.stringify(difference)}`);
      if (upper % 2_000_000 === 0 || upper === bounds.maximum) log(`Rechecked snapshot IDs through ${upper.toLocaleString()} (${Math.round(upper / bounds.maximum * 100)}%)`);
    }
    return finishVerification(target, original, source, destination, counts.old, version, startedAt, log);
  } finally { target.close(); original.close(); }
}

export function compactDatabase(source: string, destination: string, log = console.log) {
  source = fs.realpathSync(source);
  destination = path.resolve(destination);
  if (source === destination || fs.existsSync(destination)) throw new Error("Destination must be a new database file");
  const available = fs.statfsSync(path.dirname(destination));
  if (available.bavail * available.bsize < fs.statSync(source).size + 3 * 1024 ** 3) {
    throw new Error("Not enough disk space to safely create a separate database");
  }
  const original = new Database(source, { readonly: true });
  const version = original.pragma("data_version", { simple: true });
  const target = new Database(destination);
  const startedAt = new Date().toISOString();
  let complete = false;
  try {
    if (!(original.prepare("PRAGMA table_info(company_snapshots)").all() as { name: string }[])
      .some(({ name }) => name === "created_at")) throw new Error("Source is not a legacy database");
    target.pragma("journal_mode = DELETE");
    target.pragma("synchronous = NORMAL");
    target.pragma("cache_size = -131072");
    target.pragma("temp_store = FILE");
    migrate(target, { deferSnapshotIndexes: true });
    target.prepare("ATTACH DATABASE ? AS legacy").run(source);
    // Build large indexes once after copying, rather than updating them row by row.
    const companyIndexes = target.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'companies'")
      .all() as { name: string; sql: string }[];
    for (const { name } of companyIndexes) target.exec(`DROP INDEX "${name}"`);
    for (const table of ["source_files", "companies", "monthly_statistics"]) {
      const columns = (target.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(({ name }) => name).join(",");
      log(`Copying ${table}`);
      target.exec(`INSERT INTO ${table} (${columns}) SELECT ${columns} FROM legacy.${table} ORDER BY rowid`);
      const differences = target.prepare(`SELECT 1 FROM (SELECT ${columns} FROM legacy.${table}
        EXCEPT SELECT ${columns} FROM ${table}) LIMIT 1`).get();
      const counts = target.prepare(`SELECT (SELECT COUNT(*) FROM ${table}) = (SELECT COUNT(*) FROM legacy.${table}) AS equal`).get() as { equal: number };
      if (differences || !counts.equal) throw new Error(`${table} did not match`);
    }
    for (const { sql } of companyIndexes) target.exec(sql);
    const { maximum } = target.prepare("SELECT MAX(id) AS maximum FROM legacy.company_snapshots").get() as { maximum: number };
    const columns = snapshotColumns.join(",");
    const insert = target.prepare(`INSERT INTO company_snapshots (${columns}) SELECT ${columns}
      FROM legacy.company_snapshots WHERE id > ? AND id <= ? ORDER BY id`);
    const mismatch = target.prepare(`SELECT s.id FROM legacy.company_snapshots s
      LEFT JOIN company_snapshots n ON n.id = s.id WHERE s.id > ? AND s.id <= ? AND
      (${snapshotColumns.map((column) => `s.${column} IS NOT n.${column}`).join(" OR ")}
       OR s.estimated_average_monthly_salary IS NOT (${estimatedMonthlySalarySql("n")})
       OR s.estimated_average_annual_salary IS NOT ((${estimatedMonthlySalarySql("n")}) * 12)) LIMIT 1`);
    let count = 0;
    for (let lower = 0; lower < maximum; lower += 250_000) {
      const upper = Math.min(maximum, lower + 250_000);
      target.transaction(() => {
        count += insert.run(lower, upper).changes;
        const difference = mismatch.get(lower, upper);
        if (difference) throw new Error(`Snapshot mismatch: ${JSON.stringify(difference)}`);
      })();
      if (upper % 2_000_000 === 0 || upper === maximum) log(`Copied and compared ${count.toLocaleString()} snapshots (${Math.round(upper / maximum * 100)}%)`);
    }
    const actual = target.prepare("SELECT COUNT(*) AS count FROM company_snapshots").get() as { count: number };
    if (actual.count !== count) throw new Error("Snapshot count mismatch");
    target.exec(`UPDATE main.sqlite_sequence SET seq = MAX(seq, COALESCE(
      (SELECT old.seq FROM legacy.sqlite_sequence old WHERE old.name = sqlite_sequence.name), 0))
      WHERE name IN ('source_files', 'companies', 'company_snapshots');`);
    log("Building snapshot indexes");
    createSnapshotIndexes(target);
    log("Rebuilding full-text search index");
    rebuildCompanySearchIndex(target);
    const report = finishVerification(target, original, source, destination, count, version, startedAt, log);
    complete = true;
    return report;
  } finally {
    target.close();
    original.close();
    if (!complete) log(`Migration incomplete. Original untouched; candidate must not be activated: ${destination}`);
  }
}
