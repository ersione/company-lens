import fs from "node:fs";
import path from "node:path";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { acquireImportLock } from "@/lib/import-lock";
import { syncNpsHistory } from "@/lib/nps-sync";
import { dueSyncMonth } from "@/lib/nps-sync-schedule";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run"), scheduled = args.includes("--scheduled");
const limitArg = args.find((arg) => arg.startsWith("--limit="))?.slice(8);
if (args.some((arg) => !["--dry-run", "--prune", "--scheduled"].includes(arg) && !/^--limit=[1-9]\d*$/.test(arg))
    || (limitArg && !Number.isSafeInteger(Number(limitArg))) || (scheduled && (dryRun || limitArg))) {
  throw new Error("Usage: sync:nps-history [--dry-run | --scheduled] [--prune] [--limit=N]");
}
const statusPath = path.resolve("data/nps-sync-status.json");
const previous = fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, "utf8")) : {};
const dueMonth = dueSyncMonth();
if (scheduled && previous.lastSuccessfulScheduledMonth >= dueMonth) {
  console.log(`Already checked ${dueMonth}; next month-end run remains scheduled.`);
} else {
  const client = createDb();
  let release: (() => unknown) | undefined;
  const startedAt = new Date().toISOString();
  const save = (value: object) => {
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    fs.writeFileSync(`${statusPath}.tmp`, JSON.stringify(value, null, 2));
    fs.renameSync(`${statusPath}.tmp`, statusPath);
  };
  try {
    migrate(client.sqlite);
    release = acquireImportLock(client.sqlite);
    if (!dryRun) save({ ...previous, state: "running", startedAt });
    const result = await syncNpsHistory(client, { dryRun, prune: args.includes("--prune"), limit: limitArg ? Number(limitArg) : undefined });
    console.log(JSON.stringify(result));
    if (scheduled && result.latestPublishedAt.slice(0, 7) < dueMonth) {
      throw new Error(`No ${dueMonth} release yet; keeping the scheduled month incomplete for retry.`);
    }
    if (!dryRun) save({ state: "success", startedAt, finishedAt: new Date().toISOString(), result,
      lastSuccessfulScheduledMonth: scheduled ? dueMonth : previous.lastSuccessfulScheduledMonth });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    if (!dryRun && release) save({ ...previous, state: "failed", startedAt, finishedAt: new Date().toISOString(), error: message });
    process.exitCode = 1;
  } finally { try { release?.(); } finally { client.sqlite.close(); } }
}
