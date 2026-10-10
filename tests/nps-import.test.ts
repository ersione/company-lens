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
