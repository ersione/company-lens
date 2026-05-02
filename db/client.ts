import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const defaultPath = path.join(process.cwd(), "data", "db", "company-lens.sqlite");

export function getDatabasePath() {
  return process.env.DATABASE_URL?.replace(/^file:/, "") ?? defaultPath;
}

export function createSqliteClient(databasePath = getDatabasePath()) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return sqlite;
}

export function createDb(databasePath = getDatabasePath()) {
  const sqlite = createSqliteClient(databasePath);
  return {
    sqlite,
    db: drizzle(sqlite, { schema })
  };
}
