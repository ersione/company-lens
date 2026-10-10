import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { pruneRawData } from "@/lib/prune-raw-data";

test("raw pruning verifies decompressed checksums, protects unimported files, and retains only the latest source", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-prune-"));
  const raw = path.join(directory, "raw");
  fs.mkdirSync(path.join(raw, "archive"), { recursive: true });
  const client = createDb(path.join(directory, "test.sqlite"));
  const latest = path.join(raw, "latest.csv");
  const old = path.join(raw, "old.csv");
  const compressed = path.join(raw, "archive", "old.csv.gz");
  const unknown = path.join(raw, "unknown.csv");
  try {
    migrate(client.sqlite);
    fs.writeFileSync(latest, "latest contents");
    fs.writeFileSync(old, "old contents");
    fs.writeFileSync(compressed, gzipSync("old contents"));
    for (const [month, contents] of [["2026-08", "latest contents"], ["2015-11", "old contents"]]) {
      client.sqlite.prepare(`INSERT INTO source_files(source_name,file_name,snapshot_month,checksum,row_count,imported_at)
        VALUES('test','test.csv',?,?,1,'now')`).run(month, crypto.createHash("sha256").update(contents).digest("hex"));
    }
    await assert.rejects(() => pruneRawData(client.sqlite, raw, old, { apply: true }), /latest imported/);
    fs.writeFileSync(unknown, "not imported");
    await assert.rejects(() => pruneRawData(client.sqlite, raw, latest, { apply: true }), /nothing deleted/);
    assert.ok(fs.existsSync(old) && fs.existsSync(compressed));
    fs.unlinkSync(unknown);
    const preview = await pruneRawData(client.sqlite, raw, latest);
    assert.equal(preview.removableFiles, 2);
    assert.equal(preview.removedFiles, 0);
    assert.ok(fs.existsSync(old));
    const result = await pruneRawData(client.sqlite, raw, latest, { apply: true });
    assert.equal(result.removedFiles, 2);
    assert.deepEqual(fs.readdirSync(raw), ["latest.csv"]);
    assert.equal(fs.readFileSync(latest, "utf8"), "latest contents");
    assert.equal((await pruneRawData(client.sqlite, raw, latest, { apply: true })).removedFiles, 0);
  } finally {
    client.sqlite.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
