import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { refreshCompanyBenchmarks } from "@/lib/company-benchmarks";
import { acquireImportLock } from "@/lib/import-lock";

const { sqlite } = createDb();
let release: (() => unknown) | undefined;
try {
  release = acquireImportLock(sqlite);
  migrate(sqlite);
  sqlite.pragma("cache_size = -65536");
  sqlite.pragma("temp_store = FILE");
  const latest = sqlite.prepare("SELECT MAX(snapshot_month) AS month FROM monthly_statistics").get() as { month: string | null };
  if (!latest.month) throw new Error("Import data before rebuilding benchmarks");
  console.log(`Rebuilt ${refreshCompanyBenchmarks(sqlite, latest.month)} company benchmarks for ${latest.month}`);
} finally { release?.(); sqlite.close(); }
