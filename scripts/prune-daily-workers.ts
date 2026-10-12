import { createDb, getDatabasePath } from "@/db/client";
import { inventoryDailyWorkers, pruneDailyWorkers, verifyDailyWorkerCandidate } from "@/lib/prune-daily-workers";

if (process.argv.includes("--verify")) {
  verifyDailyWorkerCandidate(getDatabasePath(), `${getDatabasePath()}.without-daily`);
} else if (process.argv.includes("--apply")) {
  await pruneDailyWorkers(getDatabasePath(), `${getDatabasePath()}.without-daily`);
} else {
  const client = createDb();
  try { console.log(inventoryDailyWorkers(client.sqlite)); }
  finally { client.sqlite.close(); }
  console.log("Dry run only. Use --apply to create a verified separate database; activation is manual.");
}
