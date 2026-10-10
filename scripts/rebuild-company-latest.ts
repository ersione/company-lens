import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { rebuildCompanyLatest } from "@/lib/company-latest";

const client = createDb();
try {
  migrate(client.sqlite);
  client.sqlite.pragma("cache_size = -65536");
  const start = performance.now();
  console.log("Building latest-company search data; existing readers remain available.");
  const count = rebuildCompanyLatest(client.sqlite, (rows) => console.log(`Prepared ${rows} latest-company rows`));
  console.log(`Built ${count} latest-company rows in ${Math.round((performance.now() - start) / 1000)}s`);
} finally {
  client.sqlite.close();
}
