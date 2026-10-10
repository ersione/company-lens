import crypto from "node:crypto";
import type Database from "better-sqlite3";

export function acquireImportLock(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS local_job_locks (
    name TEXT PRIMARY KEY, pid INTEGER NOT NULL, token TEXT NOT NULL, acquired_at TEXT NOT NULL
  );`);
  const token = crypto.randomUUID();
  sqlite.transaction(() => {
    const owner = sqlite.prepare("SELECT pid FROM local_job_locks WHERE name = 'nps-import'").get() as { pid: number } | undefined;
    if (owner) {
      let alive = true;
      try { process.kill(owner.pid, 0); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; }
      if (alive) throw new Error(`NPS import already running (PID ${owner.pid}); nothing started.`);
      sqlite.exec("DELETE FROM local_job_locks WHERE name = 'nps-import';");
    }
    sqlite.prepare("INSERT INTO local_job_locks VALUES ('nps-import', ?, ?, ?)")
      .run(process.pid, token, new Date().toISOString());
  }).immediate();
  return () => sqlite.prepare("DELETE FROM local_job_locks WHERE name = 'nps-import' AND token = ?").run(token);
}
