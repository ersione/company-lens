import Database from "better-sqlite3";
import { getDatabasePath } from "@/db/client";
import { pruneRawData } from "@/lib/prune-raw-data";

const keep = process.argv.find((argument) => argument.startsWith("--keep="))?.slice(7);
if (!keep) throw new Error("Specify --keep=data/raw/<latest.csv>; default is a verification-only dry run");
const sqlite = new Database(getDatabasePath(), { readonly: true });
try {
  console.log(JSON.stringify(await pruneRawData(sqlite, "data/raw", keep,
    { apply: process.argv.includes("--apply"), log: console.log }), null, 2));
} finally { sqlite.close(); }
