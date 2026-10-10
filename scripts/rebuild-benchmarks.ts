import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { refreshCompanyBenchmarks } from "@/lib/company-benchmarks";

const { sqlite } = createDb();
try {
  migrate(sqlite);
  sqlite.pragma("temp_store = FILE");
  const latest = sqlite.prepare("SELECT MAX(snapshot_month) AS month FROM monthly_statistics").get() as { month: string | null };
  if (!latest.month) throw new Error("Import data before rebuilding benchmarks");
  console.log(`Rebuilt ${refreshCompanyBenchmarks(sqlite, latest.month)} company benchmarks for ${latest.month}`);
} finally { sqlite.close(); }
