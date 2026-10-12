import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { importNpsCsv } from "@/lib/nps-import";
import { acquireImportLock } from "@/lib/import-lock";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: npm run import:nps -- data/raw/<file.csv>");
  process.exit(1);
}

const client = createDb();
let release: (() => unknown) | undefined;

try {
  migrate(client.sqlite);
  release = acquireImportLock(client.sqlite);
  const publishedAt = process.argv.find((arg) => arg.startsWith("--published-at="))?.split("=")[1];
  if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) throw new Error("공개일은 YYYY-MM-DD 형식이어야 합니다.");
  const result = await importNpsCsv(filePath, client, (rows) => console.log(`Processed ${rows.toLocaleString()} rows`), { publishedAt });
  console.log(`Imported ${result.snapshotCount} snapshots from ${result.sourceFile.fileName}`);
  console.log(`Snapshot month: ${result.sourceFile.snapshotMonth}`);
  console.log(`Raw rows: ${result.rowCount}; excluded daily-worker rows: ${result.excludedRowCount}; aggregated rows: ${result.aggregatedRowCount}`);
  console.log(`Source checksum: ${result.sourceFile.checksum}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  try { release?.(); } finally { client.sqlite.close(); }
}
