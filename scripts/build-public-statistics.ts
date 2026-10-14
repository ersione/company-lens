import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { acquireImportLock } from "@/lib/import-lock";
import { rebuildPublicAnnualStatistics, refreshPublicStatistics } from "@/lib/public-statistics";

const client = createDb();
let release: (() => unknown) | undefined;
try {
  release = acquireImportLock(client.sqlite);
  migrate(client.sqlite);
  client.sqlite.pragma("cache_size = -65536");
  const force = process.argv.includes("--force");
  const months = client.sqlite.prepare(`SELECT snapshot_month AS month, id FROM source_files s
    WHERE id = (SELECT id FROM source_files WHERE snapshot_month = s.snapshot_month
      ORDER BY COALESCE(published_at, '') DESC, id DESC LIMIT 1)
    ORDER BY snapshot_month`).all() as { month: string; id: number }[];
  for (const { month, id } of months) {
    const done = client.sqlite.prepare(`SELECT 1 FROM employment_cube_months
      WHERE snapshot_month = ? AND source_file_id = ?`).get(month, id);
    if (done && !force) continue;
    const start = performance.now();
    refreshPublicStatistics(client.sqlite, month);
    console.log(`${month}: aggregated in ${((performance.now() - start) / 1000).toFixed(1)}s`);
  }
  console.log(`Rebuilt ${rebuildPublicAnnualStatistics(client.sqlite)} annual summaries.`);
  const mismatch = client.sqlite.prepare(`SELECT m.snapshot_month FROM monthly_statistics m
    LEFT JOIN public_monthly_statistics p ON p.dimension = 'total' AND p.dimension_key = '전국'
      AND p.snapshot_month = m.snapshot_month AND p.source_file_id = m.source_file_id
    WHERE p.snapshot_month IS NULL OR p.workplace_count != m.active_workplace_count
      OR p.subscriber_count != m.subscriber_count OR p.new_joiners != m.new_joiners OR p.departures != m.departures LIMIT 1`).get();
  if (mismatch) throw new Error(`Public totals do not match existing canonical monthly statistics: ${JSON.stringify(mismatch)}`);
  console.log("Verified public totals against canonical monthly statistics.");
  console.log("Public monthly statistics ready. Imports refresh affected months automatically.");
} finally { release?.(); client.sqlite.close(); }
