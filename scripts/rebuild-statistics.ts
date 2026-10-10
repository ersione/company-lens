import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { rebuildMonthlyStatistics } from "@/lib/monthly-statistics";

const client = createDb();
try {
  migrate(client.sqlite);
  console.log(`Rebuilt ${rebuildMonthlyStatistics(client.sqlite)} monthly statistics rows`);
} finally { client.sqlite.close(); }
