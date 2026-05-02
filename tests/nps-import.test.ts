import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import {
  decodeCsvFile,
  estimateSalary,
  importNpsCsv,
  parseCsv,
  parseInteger,
  parseNpsRow,
  validateRequiredColumns
} from "@/lib/nps-import";

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

function tempBinaryFile(contents: Buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "company-lens-"));
  const filePath = path.join(dir, "nps.csv");
  fs.writeFileSync(filePath, contents);
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

test("accepts public-data status column aliases", () => {
  const rows = parseCsv(
    `${header.replace("사업장가입상태코드", "사업장가입상태코드 1 등록 2 탈퇴")}\n2025-01,테스트회사,,1,서울시 강남구,,소프트웨어,10,"9,000,000",2,1\n`
  );

  validateRequiredColumns(rows);
  assert.equal(rows[0]["사업장가입상태코드"], "1");
});

test("decodes CP949 public-data CSV files", () => {
  const filePath = tempBinaryFile(Buffer.from([0xc0, 0xda, 0xb7, 0xe1]));
  assert.equal(decodeCsvFile(filePath), "자료");
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

test("updates duplicate company snapshots within the same source file", async () => {
  const filePath = tempFile(
    `${header}\n202501,테스트회사,123-45-67890,1,서울시 강남구,,소프트웨어,10,"9,000,000",2,1\n202501,테스트회사,123-45-67890,1,서울시 강남구,,소프트웨어,12,"10,800,000",3,2\n`
  );
  const dbPath = path.join(path.dirname(filePath), "test.sqlite");
  const client = createDb(dbPath);

  try {
    migrate(client.sqlite);
    await importNpsCsv(filePath, client);
    const snapshot = client.sqlite
      .prepare("SELECT employee_count AS employeeCount, new_joiners AS newJoiners FROM company_snapshots")
      .get() as { employeeCount: number; newJoiners: number };

    assert.equal(snapshot.employeeCount, 12);
    assert.equal(snapshot.newJoiners, 3);
  } finally {
    client.sqlite.close();
  }
});

test("keeps workplaces distinct when registration prefix is shared", async () => {
  const filePath = tempFile(
    `${header}\n202501,테스트회사A,123456,1,서울시 강남구,,소프트웨어,10,"9,000,000",2,1\n202501,테스트회사B,123456,1,서울시 서초구,,소프트웨어,12,"10,800,000",3,2\n`
  );
  const dbPath = path.join(path.dirname(filePath), "test.sqlite");
  const client = createDb(dbPath);

  try {
    migrate(client.sqlite);
    await importNpsCsv(filePath, client);
    const row = client.sqlite.prepare("SELECT COUNT(*) AS count FROM companies").get() as { count: number };

    assert.equal(row.count, 2);
  } finally {
    client.sqlite.close();
  }
});
