import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import iconv from "iconv-lite";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import {
  estimateSalary,
  importNpsCsv,
  parseCsv,
  parseInteger,
  parseNpsRow,
  validateRequiredColumns
} from "@/lib/nps-import";
import { pensionRateForMonth } from "@/lib/pension";

const header = [
  "자료생성년월",
  "사업장명",
  "사업자등록번호",
  "사업장가입상태코드",
  "사업장도로명상세주소",
  "사업장지번상세주소",
  "사업장업종코드명",
  "가입자수",
  "당월고지금액",
  "신규취득자수",
  "상실가입자수"
].join(",");

function tempFile(contents: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-"));
  const filePath = path.join(dir, "nps.csv");
  fs.writeFileSync(filePath, contents, "utf8");
  return filePath;
}

test("rejects CSV files missing required columns", () => {
  const rows = parseCsv("자료생성년월,사업장명\n202501,테스트회사\n");
  assert.throws(() => validateRequiredColumns(rows), /필수 컬럼이 없습니다/);
});

test("parses comma-formatted Korean numeric values", () => {
  assert.equal(parseInteger("1,234"), 1234);
  assert.equal(parseInteger(" 9,876원 "), 9876);
  assert.equal(parseInteger(""), null);
});

test("does not estimate salary for zero or missing employee count", () => {
  assert.deepEqual(estimateSalary(900000, 0), {
    estimatedAverageMonthlySalary: null,
    estimatedAverageAnnualSalary: null
  });
  assert.deepEqual(estimateSalary(900000, null), {
    estimatedAverageMonthlySalary: null,
    estimatedAverageAnnualSalary: null
  });
});

test("parses a valid NPS row with fallback identity and salary estimate", () => {
  const [row] = parseCsv(
    `${header}\n202501,테스트회사,,1,서울시 강남구,,소프트웨어,\"10\",\"9,000,000\",2,1\n`
  );

  validateRequiredColumns([row]);
  const parsed = parseNpsRow(row as never);

  assert.equal(parsed.snapshotMonth, "2025-01");
  assert.equal(parsed.identityKey, "fallback:테스트회사:서울시 강남구");
  assert.equal(parsed.employeeCount, 10);
  assert.equal(parsed.estimatedAverageMonthlySalary, 10000000);
  assert.equal(parsed.estimatedAverageAnnualSalary, 120000000);
});

test("blocks duplicate imports by checksum", async () => {
  const filePath = tempFile(
    `${header}\n202501,테스트회사,123-45-67890,1,서울시 강남구,,소프트웨어,10,\"9,000,000\",2,1\n`
  );
  const dbPath = path.join(path.dirname(filePath), "test.sqlite");
  const client = createDb(dbPath);

  try {
    migrate(client.sqlite);
    await importNpsCsv(filePath, client);
    await assert.rejects(() => importNpsCsv(filePath, client), /이미 가져온 파일입니다/);
  } finally {
    client.sqlite.close();
  }
});

test("imports skip daily-worker rows even when all rows are excluded, preserving raw provenance", async () => {
  const filePath = tempFile(`${header}\n202601,회사/일용/현장,123456,1,,,,10,950000,2,1\n`);
  const client = createDb(path.join(path.dirname(filePath), "test.sqlite"));
  try {
    migrate(client.sqlite);
    const excluded = await importNpsCsv(filePath, client);
    assert.equal(excluded.rowCount,1);
    assert.equal(excluded.excludedRowCount,1);
    assert.equal(excluded.snapshotCount,0);
    assert.equal(excluded.aggregatedRowCount,0);
    assert.deepEqual(client.sqlite.prepare("SELECT workplace_count AS n,active_workplace_count AS active FROM monthly_statistics").get(),{n:0,active:0});
    fs.writeFileSync(filePath,`${header}\n202602,일용상사,123456,1,,,,10,950000,2,1\n202602,회사 건설일용관리,999999,1,,,,5,475000,1,0\n202602,회사-일용)현장,888888,1,,,,3,285000,1,0\n`);
    const mixed = await importNpsCsv(filePath,client);
    assert.equal(mixed.rowCount,3);
    assert.equal(mixed.excludedRowCount,2);
    assert.equal(mixed.snapshotCount,1);
    assert.deepEqual(client.sqlite.prepare("SELECT name FROM companies").all(),[{name:"일용상사"}]);
  } finally { client.sqlite.close(); fs.rmSync(path.dirname(filePath),{recursive:true,force:true}); }
});

test("applies contribution rates by snapshot year and handles zero billed amount", () => {
  assert.equal(pensionRateForMonth("2025-12"), 0.09);
  assert.equal(pensionRateForMonth("2026-01"), 0.095);
  assert.equal(pensionRateForMonth("2033-01"), 0.13);
  assert.equal(estimateSalary(950000, 10, "2026-08").estimatedAverageMonthlySalary, 1000000);
  assert.equal(estimateSalary(0, 10, "2026-08").estimatedAverageMonthlySalary, 0);
  assert.throws(() => parseInteger("-12"));
  assert.throws(() => parseInteger("12bad"));
});

test("imports EUC-KR official headers, separates masked registrations, and aggregates repeated workplaces", async () => {
  const officialHeader = header.replace("사업장가입상태코드", "사업장가입상태코드 1 등록 2 탈퇴");
  const contents = `${officialHeader}\n202608,테스트회사,123456,1,서울시 강남구,,소프트웨어,10,950000,2,1\n202608,테스트회사,123456,1,서울시 강남구,,소프트웨어,5,475000,1,0\n202608,다른회사,123456,1,서울시 중구,,,3,285000,0,0\n`;
  const filePath = tempFile("");
  fs.writeFileSync(filePath, iconv.encode(contents, "euc-kr"));
  const client = createDb(path.join(path.dirname(filePath), "test.sqlite"));
  try {
    migrate(client.sqlite);
    const result = await importNpsCsv(filePath, client);
    assert.equal(result.rowCount, 3);
    assert.equal(result.companyCount, 2);
    assert.equal(result.aggregatedRowCount, 1);
    const snapshot = client.sqlite.prepare(`SELECT s.* FROM company_snapshots s JOIN companies c ON c.id = s.company_id WHERE c.name = '테스트회사'`).get() as Record<string, number>;
    assert.equal(snapshot.employee_count, 15);
    assert.equal(snapshot.new_joiners, 3);
    assert.deepEqual(estimateSalary(snapshot.monthly_billed_amount, snapshot.employee_count, "2026-08"), {
      estimatedAverageMonthlySalary: 1000000, estimatedAverageAnnualSalary: 12000000
    });
    assert.ok(!("estimated_average_monthly_salary" in snapshot));
  } finally {
    client.sqlite.close();
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test("rolls back all rows and the source record when a later row is invalid", async () => {
  const filePath = tempFile(`${header}\n202608,테스트회사,123456,1,,,,10,950000,2,1\n202608,다른회사,999999,1,,,,-1,950000,2,1\n`);
  const client = createDb(path.join(path.dirname(filePath), "test.sqlite"));
  try {
    migrate(client.sqlite);
    await assert.rejects(() => importNpsCsv(filePath, client), /정수가 아닙니다/);
    assert.deepEqual(client.sqlite.prepare("SELECT COUNT(*) AS count FROM companies").get(), { count: 0 });
    assert.deepEqual(client.sqlite.prepare("SELECT COUNT(*) AS count FROM source_files").get(), { count: 0 });
  } finally {
    client.sqlite.close();
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});

test("name observations preserve collected names without stitching masked identities", async () => {
  const filePath = tempFile(`${header}\n202601,이전상호,1234567890,1,서울시 강남구,,소프트웨어,10,950000,0,0\n202601,이전상호,123456,1,서울시 중구,,소프트웨어,10,950000,0,0\n`);
  const client = createDb(path.join(path.dirname(filePath), "test.sqlite"));
  try {
    migrate(client.sqlite);
    await importNpsCsv(filePath, client);
    fs.writeFileSync(filePath, `${header}\n202602,새상호,1234567890,1,서울시 강남구,,소프트웨어,12,1140000,2,0\n202602,새상호,123456,1,서울시 중구,,소프트웨어,12,1140000,2,0\n`);
    await importNpsCsv(filePath, client);
    const names = client.sqlite.prepare(`SELECT name, first_seen_month AS first, last_seen_month AS last
      FROM company_name_observations WHERE company_id = (SELECT id FROM companies WHERE identity_key = 'registration:1234567890')
      ORDER BY first_seen_month`).all();
    assert.deepEqual(names, [{ name: "이전상호", first: "2026-01", last: "2026-01" }, { name: "새상호", first: "2026-02", last: "2026-02" }]);
    assert.deepEqual(client.sqlite.prepare("SELECT COUNT(*) AS count FROM companies").get(), { count: 3 });
    fs.writeFileSync(filePath, `${header}\n202512,더옛상호,1234567890,1,서울시 강남구,,소프트웨어,8,720000,0,0\n`);
    await importNpsCsv(filePath, client);
    assert.equal((client.sqlite.prepare("SELECT name FROM companies WHERE identity_key = 'registration:1234567890'").get() as { name: string }).name, "새상호");
    assert.deepEqual(client.sqlite.prepare(`SELECT COUNT(*) AS count FROM company_name_observations
      WHERE company_id = (SELECT id FROM companies WHERE identity_key = 'registration:1234567890')`).get(), { count: 3 });
  } finally {
    client.sqlite.close();
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  }
});
