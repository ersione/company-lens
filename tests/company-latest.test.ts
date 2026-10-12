import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import { rebuildCompanyLatest, hasCompanyLatest } from "@/lib/company-latest";
import { importNpsCsv, requiredColumns } from "@/lib/nps-import";

test("latest search state handles omitted revisions, older imports, nulls and atomic failures", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-latest-"));
  const client = createDb(path.join(directory, "test.sqlite"));
  const write = (file: string, month: string, rows: [string, string, string][]) => {
    const target = path.join(directory, file);
    fs.writeFileSync(target, `${requiredColumns.join(",")}\n${rows.map(([name, registration, count]) =>
      `${month},${name},${registration},1,서울특별시 강남구,,업종,${count},950000,2,1`).join("\n")}\n`);
    return target;
  };
  const latest = () => client.sqlite.prepare(`SELECT c.name, s.snapshot_month AS month, s.employee_count AS employees
    FROM companies c LEFT JOIN company_latest s ON s.company_id = c.id ORDER BY c.name`).all();
  try {
    migrate(client.sqlite);
    assert.equal(hasCompanyLatest(client.sqlite), false);
    assert.equal(rebuildCompanyLatest(client.sqlite), 0);
    assert.equal(hasCompanyLatest(client.sqlite), true);
    await importNpsCsv(write("july.csv", "202607", [["누락회사", "1111111111", "10"]]), client);
    await importNpsCsv(write("august.csv", "202608", [["누락회사", "1111111111", "20"], ["수정회사", "2222222222", "30"]]),
      client, undefined, { publishedAt: "2026-09-23" });
    await importNpsCsv(write("revision.csv", "202608", [["수정회사", "2222222222", ""]]),
      client, undefined, { publishedAt: "2026-09-24" });
    assert.deepEqual(latest(), [{ name: "누락회사", month: "2026-07", employees: 10 },
      { name: "수정회사", month: "2026-08", employees: null }]);
    const indexedCounts = () => client.sqlite.prepare(`SELECT employee_count AS employees
      FROM company_latest INDEXED BY company_latest_employees_idx ORDER BY employee_count DESC`).all();
    assert.deepEqual(indexedCounts(), [{ employees: 10 }, { employees: null }]);
    await importNpsCsv(write("older.csv", "202608", [["수정회사", "2222222222", "999"]]),
      client, undefined, { publishedAt: "2026-09-22" });
    assert.equal((latest()[1] as { employees: number | null }).employees, null);
    const before = latest();
    assert.equal(rebuildCompanyLatest(client.sqlite), 2);
    assert.deepEqual(latest(), before);
    const count = client.sqlite.prepare("SELECT COUNT(*) AS n FROM source_files").get();
    client.sqlite.exec(`CREATE TRIGGER fail_latest BEFORE INSERT ON company_latest BEGIN SELECT RAISE(ABORT, 'test failure'); END;`);
    await assert.rejects(() => importNpsCsv(write("september.csv", "202609", [["수정회사", "2222222222", "40"]]), client), /test failure/);
    assert.deepEqual(latest(), before);
    assert.deepEqual(client.sqlite.prepare("SELECT COUNT(*) AS n FROM source_files").get(), count);
    assert.throws(() => rebuildCompanyLatest(client.sqlite), /test failure/);
    assert.deepEqual(latest(), before);
    client.sqlite.exec("DROP TRIGGER fail_latest;");
    assert.deepEqual(indexedCounts(), [{ employees: 10 }, { employees: null }]);
    client.sqlite.exec("DELETE FROM companies WHERE name = '누락회사';");
    assert.equal(latest().length, 1);
    assert.deepEqual(indexedCounts(), [{ employees: null }]);
  } finally {
    client.sqlite.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
