import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { importNpsCsv } from "@/lib/nps-import";

const filePath = process.argv[2];

if (!filePath) {
  console.error("Usage: npm run import:nps -- data/raw/<file.csv>");
  process.exit(1);
}

const client = createDb();

try {
  migrate(client.sqlite);
  const result = await importNpsCsv(filePath, client);
  console.log(`Imported ${result.snapshotCount} snapshots from ${result.sourceFile.fileName}`);
  console.log(`Snapshot month: ${result.sourceFile.snapshotMonth}`);
  console.log(`Source checksum: ${result.sourceFile.checksum}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.sqlite.close();
}
