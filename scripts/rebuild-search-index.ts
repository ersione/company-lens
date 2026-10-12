import fs from "node:fs";
import path from "node:path";
import { createDb, getDatabasePath } from "../db/client";
import { migrate } from "../db/migrate";
import { rebuildCompanySearchIndex } from "../lib/company-search-index";
import { acquireImportLock } from "../lib/import-lock";

const location = path.dirname(getDatabasePath());
fs.mkdirSync(location, { recursive: true });
const disk = fs.statfsSync(location);
if (disk.bavail * disk.bsize < 5 * 1024 ** 3) throw new Error("Search indexing requires at least 5GB free disk space.");
const client = createDb();
let release: (() => unknown) | undefined;
try {
  migrate(client.sqlite);
  release = acquireImportLock(client.sqlite);
  client.sqlite.pragma("cache_size = -131072");
  console.time("Search index");
  console.log("Building company substring index. Existing data remains readable.");
  rebuildCompanySearchIndex(client.sqlite);
  console.timeEnd("Search index");
} finally {
  release?.();
  client.sqlite.close();
}
