import fs from "node:fs";
import path from "node:path";
import { createDb, getDatabasePath } from "../db/client";
import { migrate } from "../db/migrate";
import { acquireImportLock } from "../lib/import-lock";
import { rebuildCompanyShortSearchIndex } from "../lib/company-short-search";

const directory = path.dirname(getDatabasePath());
fs.mkdirSync(directory, { recursive: true });
const disk = fs.statfsSync(directory);
if (disk.bavail * disk.bsize < 5 * 1024 ** 3) throw new Error("Short search indexing requires at least 5GB free space.");
const client = createDb();
let release: (() => unknown) | undefined;
try {
  migrate(client.sqlite);
  release = acquireImportLock(client.sqlite);
  client.sqlite.pragma("cache_size = -131072");
  console.time("Short search index");
  rebuildCompanyShortSearchIndex(client.sqlite, (count) => console.log(`Indexed ${count} workplaces`));
  console.timeEnd("Short search index");
} finally { release?.(); client.sqlite.close(); }
