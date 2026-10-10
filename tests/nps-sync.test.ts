import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { acquireImportLock } from "@/lib/import-lock";
import { dueSyncMonth, syncCalendar } from "@/lib/nps-sync-schedule";
import { syncNpsHistory } from "@/lib/nps-sync";
import { requiredColumns } from "@/lib/nps-import";
import { rebuildCompanyLatest } from "@/lib/company-latest";
import type { ArchiveFile } from "@/lib/nps-archive";

test("month-end calendar handles leap years, KST boundaries and missed-run catch-up", () => {
  for (const [date, expected] of [["2026-10-30T19:00:00Z", "2026-10"], ["2026-10-30T18:59:59Z", "2026-09"],
    ["2026-02-27T19:00:00Z", "2026-02"], ["2028-02-27T19:00:00Z", "2028-01"],
    ["2028-02-28T19:00:00Z", "2028-02"], ["2026-11-01T00:00:00Z", "2026-10"],
    ["2027-01-01T00:00:00Z", "2026-12"], ["2026-04-29T19:00:00Z", "2026-04"]]) assert.equal(dueSyncMonth(new Date(date)), expected);
  assert.deepEqual(syncCalendar.map((item) => item.Day), [1, 2, 3, 28, 29, 30, 31]);
});

test("import lock rejects a live owner and recovers an exited owner's lock", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nps-lock-"));
  const first = createDb(path.join(dir, "db.sqlite")), second = createDb(path.join(dir, "db.sqlite"));
  try {
    const release = acquireImportLock(first.sqlite);
    assert.throws(() => acquireImportLock(second.sqlite), /already running/);
    release();
    first.sqlite.prepare("INSERT INTO local_job_locks VALUES ('nps-import', ?, 'stale', 'old')").run(2147483647);
    const next = acquireImportLock(second.sqlite);
    release();
    assert.throws(() => acquireImportLock(first.sqlite), /already running/);
    next();
    assert.deepEqual(first.sqlite.prepare("SELECT COUNT(*) AS n FROM local_job_locks").get(), { n: 0 });
  } finally { first.sqlite.close(); second.sqlite.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("sync dry-run, history rollover, monthly import/cache refresh and safe raw retention", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nps-sync-")), raw = path.join(dir, "raw");
  fs.mkdirSync(raw);
  const client = createDb(path.join(dir, "db.sqlite"));
  let entries: ArchiveFile[] = [{ key: "old", history: "1", title: "NPS_20260923", publishedAt: "2026-09-23" }];
  let downloads = 0;
  const options = { rawDirectory: raw, manifestPath: path.join(dir, "manifest.json"), log: () => {},
    discover: async () => entries,
    download: async (entry: ArchiveFile) => {
      downloads++;
      const filePath = path.join(raw, `${entry.key}.csv`);
      fs.writeFileSync(filePath, entry.key === "bad" ? "bad header\nbad row\n" : `${requiredColumns.join(",")}\n${entry.key === "old" ? "202608" : "202609"},동기화회사,1234567890,1,서울특별시 강남구,,업종,${entry.key === "old" ? 10 : 20},950000,2,1\n`);
      return { filePath, downloadUrl: "fixture" };
    } };
  try {
    migrate(client.sqlite); rebuildCompanyLatest(client.sqlite);
    assert.equal((await syncNpsHistory(client, { ...options, dryRun: true })).pending, 1);
    assert.equal(downloads, 0); assert.equal(fs.existsSync(options.manifestPath), false);
    await syncNpsHistory(client, options);
    const legacy = JSON.parse(fs.readFileSync(options.manifestPath, "utf8"));
    delete legacy[0].checksum;
    fs.writeFileSync(options.manifestPath, JSON.stringify(legacy));
    entries = [{ ...entries[0], history: "2" }, { key: "new", history: "1", title: "NPS_20261026", publishedAt: "2026-10-26" }];
    assert.equal((await syncNpsHistory(client, { ...options, prune: true })).imported, 1);
    assert.equal(downloads, 2);
    assert.deepEqual(fs.readdirSync(raw), ["new.csv"]);
    assert.deepEqual(client.sqlite.prepare("SELECT snapshot_month,employee_count FROM company_latest").get(), { snapshot_month: "2026-09", employee_count: 20 });
    await syncNpsHistory(client, { ...options, prune: true });
    assert.equal(downloads, 2);
    entries.push({ key: "bad", history: "1", title: "NPS_20261126", publishedAt: "2026-11-26" });
    await assert.rejects(() => syncNpsHistory(client, { ...options, prune: true }), /failed.*not pruned/);
    assert.ok(fs.existsSync(path.join(raw, "new.csv"))); assert.ok(fs.existsSync(path.join(raw, "bad.csv")));
    const manifest = JSON.parse(fs.readFileSync(options.manifestPath, "utf8"));
    assert.equal(manifest.at(-1).status, "failed");
  } finally { client.sqlite.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
