import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dailyWorkerSql } from "@/lib/daily-worker";
import { acquireImportLock } from "@/lib/import-lock";
import { hasShortSearchIndex, shortSearchMatch } from "@/lib/company-short-search";
import { rebuildCompanySearchIndex } from "@/lib/company-search-index";
import { refreshMonthlyStatistics } from "@/lib/monthly-statistics";
import { refreshCompanyBenchmarks } from "@/lib/company-benchmarks";
import { migrate, createSnapshotIndexes } from "@/db/migrate";
import { provisionCompanyEmployeeIndex } from "@/lib/company-latest";

function selectTargets(db: Database.Database) {
  db.exec("CREATE TEMP TABLE daily_targets(id INTEGER PRIMARY KEY)");
  if (hasShortSearchIndex(db)) {
    db.prepare(`INSERT INTO daily_targets SELECT c.id FROM company_short_search f
      CROSS JOIN companies c ON c.id=f.rowid WHERE company_short_search MATCH ? AND ${dailyWorkerSql("c.name")}`)
      .run(shortSearchMatch("일용", ""));
  } else db.exec(`INSERT INTO daily_targets SELECT c.id FROM companies c WHERE ${dailyWorkerSql("c.name")}`);
}

export function inventoryDailyWorkers(db: Database.Database) {
  selectTargets(db);
  try {
    return db.prepare(`SELECT COUNT(*) AS workplaces,
      COALESCE(SUM((SELECT COUNT(*) FROM company_snapshots s WHERE s.company_id=t.id)),0) AS snapshots
      FROM daily_targets t`).get() as { workplaces: number; snapshots: number };
  } finally { db.exec("DROP TABLE daily_targets"); }
}

function verifyIndexes(target: Database.Database, log: (message: string) => void) {
  // Match the existing compact-DB verifier: external-content FTS checks repeatedly probe postings.
  target.pragma("cache_size=-2097152");
  target.pragma("mmap_size=1073741824");
  log("Checking database pages (2 GiB validation cache)");
  if (target.pragma("quick_check", { simple: true }) !== "ok") throw new Error("Candidate quick check failed");
  log("Checking foreign keys");
  if (target.prepare("PRAGMA foreign_key_check").get()) throw new Error("Candidate foreign key check failed");
  log("Checking trigram FTS against retained company content");
  target.exec("INSERT INTO company_search(company_search,rank) VALUES('integrity-check',1);");
  log("Checking two-character FTS");
  target.exec("INSERT INTO company_short_search(company_short_search) VALUES('integrity-check');");
  log("Analyzing candidate indexes");
  target.exec("ANALYZE;");
}

export function verifyDailyWorkerCandidate(source: string, destination: string, log = console.log) {
  source = fs.realpathSync(source);
  destination = fs.realpathSync(destination);
  if (source === destination) throw new Error("Candidate must be separate");
  fs.rmSync(`${destination}.verified.json`, {force:true});
  const original = new Database(source);
  const release = acquireImportLock(original);
  const version = original.pragma("data_version", { simple: true });
  const target = new Database(destination);
  try {
    original.pragma("cache_size=-65536");
    const before = original.prepare(`SELECT (SELECT COUNT(*) FROM companies) AS companies,
      (SELECT COUNT(*) FROM company_snapshots) AS snapshots`).get() as {companies:number;snapshots:number};
    const after = target.prepare(`SELECT (SELECT COUNT(*) FROM companies) AS companies,
      (SELECT COUNT(*) FROM company_snapshots) AS snapshots`).get() as typeof before;
    const removed = inventoryDailyWorkers(original);
    if (before.companies-after.companies!==removed.workplaces || before.snapshots-after.snapshots!==removed.snapshots) {
      throw new Error("Candidate count differences do not match excluded records");
    }
    if (inventoryDailyWorkers(target).workplaces!==0) throw new Error("Daily-worker records remain");
    const sources = (db: Database.Database) => JSON.stringify(db.prepare("SELECT * FROM source_files ORDER BY id").all());
    if (sources(original)!==sources(target)) throw new Error("Source provenance changed");
    for (const table of ["source_files","companies","company_snapshots"]) {
      const old = original.prepare("SELECT seq FROM sqlite_sequence WHERE name=?").get(table) as {seq:number}|undefined;
      const current = target.prepare("SELECT seq FROM sqlite_sequence WHERE name=?").get(table) as {seq:number}|undefined;
      if ((current?.seq??0)<(old?.seq??0)) throw new Error(`Sequence moved backwards: ${table}`);
    }
    verifyIndexes(target, log);
    if (original.pragma("data_version", { simple: true })!==version) throw new Error("Source changed during validation");
    const report = {source,destination,before,after,removed,sourceBytes:fs.statSync(source).size,
      destinationBytes:fs.statSync(destination).size,verifiedAt:new Date().toISOString(),verification:"ok"};
    fs.writeFileSync(`${destination}.verified.json`,JSON.stringify(report,null,2));
    log(JSON.stringify(report));
    return report;
  } finally { target.close(); release(); original.close(); }
}

// Copy retained rows sequentially, then build indexes once instead of random cascaded deletes.
export async function pruneDailyWorkers(source: string, destination: string, log = console.log) {
  source = fs.realpathSync(source);
  destination = path.resolve(destination);
  if (source === destination || fs.existsSync(destination)) throw new Error("Destination must be a new separate database");
  const disk = fs.statfsSync(path.dirname(destination));
  if (disk.bavail * disk.bsize < fs.statSync(source).size * 2 + 3 * 1024 ** 3) throw new Error("Insufficient space for backup and compaction");
  const original = new Database(source);
  original.pragma("busy_timeout=5000");
  const release = acquireImportLock(original);
  const version = original.pragma("data_version", { simple: true });
  let target: Database.Database | undefined;
  try {
    if (original.pragma("user_version", { simple: true }) !== 2) throw new Error("Compact schema version 2 is required");
    log("Creating isolated filtered database; live records remain unchanged");
    target = new Database(destination);
    target.pragma("journal_mode=DELETE");
    target.pragma("synchronous=NORMAL");
    target.pragma("foreign_keys=ON");
    target.pragma("cache_size=-131072");
    target.pragma("temp_store=FILE");
    migrate(target, { deferSnapshotIndexes: true });
    target.prepare("ATTACH DATABASE ? AS original").run(source);
    const before = original.prepare(`SELECT (SELECT COUNT(*) FROM companies) AS companies,
      (SELECT COUNT(*) FROM company_snapshots) AS snapshots`).get() as { companies: number; snapshots: number };
    target.exec(`CREATE TEMP TABLE daily_targets(id INTEGER PRIMARY KEY);
      INSERT INTO daily_targets SELECT c.id FROM original.companies c WHERE ${dailyWorkerSql("c.name")};`);
    const removed = target.prepare(`SELECT COUNT(*) AS workplaces,
      COALESCE(SUM((SELECT COUNT(*) FROM original.company_snapshots s WHERE s.company_id=t.id)),0) AS snapshots
      FROM daily_targets t`).get() as { workplaces: number; snapshots: number };
    log(`Excluding ${removed.workplaces} workplaces and ${removed.snapshots} historical snapshots`);
    const indexes = target.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name='companies'").all() as {name:string;sql:string}[];
    for (const { name } of indexes) target.exec(`DROP INDEX "${name}"`);
    for (const table of ["source_files", "companies", "monthly_statistics", "company_latest", "company_latest_state", "company_name_observations"]) {
      const columns = (target.prepare(`PRAGMA table_info(${table})`).all() as {name:string}[]).map(({name})=>name);
      const filter = table === "companies" ? "WHERE NOT EXISTS(SELECT 1 FROM daily_targets t WHERE t.id=o.id)"
        : ["company_latest", "company_name_observations"].includes(table)
        ? "WHERE EXISTS(SELECT 1 FROM companies c WHERE c.id=o.company_id)" : "";
      target.exec(`INSERT INTO ${table}(${columns.join(",")}) SELECT ${columns.map(name=>`o.${name}`).join(",")}
        FROM original.${table} o ${filter}`);
      log(`Copied retained ${table}`);
    }
    const columns = (target.prepare("PRAGMA table_info(company_snapshots)").all() as {name:string}[]).map(({name})=>name);
    const maximum = (original.prepare("SELECT MAX(id) AS n FROM company_snapshots").get() as {n:number|null}).n ?? 0;
    const copy = target.prepare(`INSERT INTO company_snapshots(${columns.join(",")})
      SELECT ${columns.map(name=>`s.${name}`).join(",")} FROM original.company_snapshots s
      CROSS JOIN companies c ON c.id=s.company_id WHERE s.id>? AND s.id<=? ORDER BY s.id`);
    let copied = 0;
    for (let lower=0; lower<maximum; lower+=250000) {
      const upper = Math.min(maximum,lower+250000);
      copied += target.transaction(()=>copy.run(lower,upper).changes)();
      if (upper%2000000===0 || upper===maximum) log(`Copied ${copied} retained history rows (${Math.round(upper/maximum*100)}%)`);
    }
    const afterCounts = target.prepare(`SELECT (SELECT COUNT(*) FROM companies) AS companies,
      (SELECT COUNT(*) FROM company_snapshots) AS snapshots`).get() as typeof before;
    if (before.companies - afterCounts.companies !== removed.workplaces
      || before.snapshots - afterCounts.snapshots !== removed.snapshots) throw new Error("History deletion count mismatch");
    if (target.prepare(`SELECT 1 FROM daily_targets t JOIN companies c ON c.id=t.id LIMIT 1`).get()) {
      throw new Error("Daily-worker records remain in candidate");
    }
    target.exec(`UPDATE sqlite_sequence SET seq=MAX(seq,COALESCE(
      (SELECT o.seq FROM original.sqlite_sequence o WHERE o.name=sqlite_sequence.name),0));
      DETACH DATABASE original;`);
    log("Building company and history indexes");
    for (const {sql} of indexes) target.exec(sql);
    createSnapshotIndexes(target);
    provisionCompanyEmployeeIndex(target);
    if (target.prepare(`SELECT 1 FROM daily_targets t CROSS JOIN company_snapshots s ON s.company_id=t.id LIMIT 1`).get()) {
      throw new Error("Daily-worker history remains in candidate");
    }
    target.exec("DROP TABLE daily_targets;");
    const months = target.prepare("SELECT DISTINCT snapshot_month AS month FROM source_files ORDER BY snapshot_month").all() as { month: string }[];
    for (const { month } of months) {
      target.transaction(() => refreshMonthlyStatistics(target!, month, { refreshDerived: false }))();
      log(`Refreshed statistics ${month}`);
    }
    const latest = months.at(-1)?.month;
    if (latest) refreshCompanyBenchmarks(target, latest);
    // Cascades preserved canonical latest rows for all retained companies; source selection is unchanged.
    log("Rebuilding trigram and two-character search indexes");
    rebuildCompanySearchIndex(target, (count)=>log(`Indexed ${count} retained workplaces`));
    verifyIndexes(target,log);
    if (original.pragma("data_version", { simple: true }) !== version) throw new Error("Live database changed; do not activate candidate");
    const report = { source, destination, before, after: afterCounts, removed, sourceBytes: fs.statSync(source).size,
      destinationBytes: fs.statSync(destination).size, verifiedAt: new Date().toISOString(), verification: "ok" };
    fs.writeFileSync(`${destination}.verified.json`, JSON.stringify(report, null, 2));
    log(JSON.stringify(report));
    return report;
  } finally { target?.close(); release(); original.close(); }
}
