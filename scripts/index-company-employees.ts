import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { acquireImportLock } from "@/lib/import-lock";
import { hasCompanyLatest, provisionCompanyEmployeeIndex } from "@/lib/company-latest";

const client = createDb();
let release: (() => unknown) | undefined;
try {
  release = acquireImportLock(client.sqlite);
  migrate(client.sqlite);
  if (!hasCompanyLatest(client.sqlite)) throw new Error("Run npm run search:refresh-latest first.");
  client.sqlite.pragma("cache_size=-65536");
  const started = performance.now();
  provisionCompanyEmployeeIndex(client.sqlite);
  client.sqlite.exec("ANALYZE company_latest_employees_idx;");
  console.log(`Employee index ready in ${Math.round(performance.now()-started)}ms`);
} finally { release?.(); client.sqlite.close(); }
