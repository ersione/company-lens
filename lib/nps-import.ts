import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { companies, companySnapshots, sourceFiles } from "@/db/schema";
import type { createDb } from "@/db/client";

export const NPS_SOURCE_NAME = "국민연금공단 사업장 가입자 명부";
export const NPS_SOURCE_URL = "https://www.data.go.kr/data/15083277/fileData.do";
export const PENSION_RATE = 0.09;

export const requiredColumns = [
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
] as const;

export type NpsColumn = (typeof requiredColumns)[number];
export type NpsRawRow = Record<NpsColumn, string> & Record<string, string>;

export type ParsedNpsRow = {
  snapshotMonth: string;
  name: string;
  normalizedName: string;
  registrationNumber: string | null;
  identityKey: string;
  subscriptionStatusCode: string | null;
  roadAddress: string | null;
  lotAddress: string | null;
  address: string | null;
  industry: string | null;
  employeeCount: number | null;
  monthlyBilledAmount: number | null;
  newJoiners: number | null;
  departures: number | null;
  estimatedAverageMonthlySalary: number | null;
  estimatedAverageAnnualSalary: number | null;
};

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const input = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.trim() !== "")) {
      rows.push(row);
    }
  }

  if (rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] ?? "").trim();
    });
    return record;
  });
}

export function validateRequiredColumns(rows: Record<string, string>[]) {
  if (rows.length === 0) {
    throw new Error("CSV 파일에 데이터 행이 없습니다.");
  }

  const present = new Set(Object.keys(rows[0]));
  const missing = requiredColumns.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new Error(`필수 컬럼이 없습니다: ${missing.join(", ")}`);
  }
}

export function normalizeCompanyName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[㈜（]/g, "(")
    .replace(/[）]/g, ")")
    .toLocaleLowerCase("ko-KR");
}

export function parseInteger(value: string | null | undefined) {
  const cleaned = (value ?? "").replace(/[,\s원]/g, "");
  if (cleaned === "" || cleaned === "-") {
    return null;
  }

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeSnapshotMonth(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) {
    throw new Error(`자료생성년월 값이 올바르지 않습니다: ${value}`);
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
}

export function estimateSalary(monthlyBilledAmount: number | null, employeeCount: number | null) {
  if (!monthlyBilledAmount || !employeeCount || employeeCount <= 0) {
    return {
      estimatedAverageMonthlySalary: null,
      estimatedAverageAnnualSalary: null
    };
  }

  const estimatedAverageMonthlySalary = Math.round(monthlyBilledAmount / employeeCount / PENSION_RATE);
  return {
    estimatedAverageMonthlySalary,
    estimatedAverageAnnualSalary: estimatedAverageMonthlySalary * 12
  };
}

export function parseNpsRow(row: NpsRawRow): ParsedNpsRow {
  const name = row["사업장명"].trim();
  if (!name) {
    throw new Error("사업장명이 비어 있는 행이 있습니다.");
  }

  const roadAddress = row["사업장도로명상세주소"].trim() || null;
  const lotAddress = row["사업장지번상세주소"].trim() || null;
  const address = roadAddress ?? lotAddress;
  const registrationNumber = row["사업자등록번호"].replace(/\D/g, "") || null;
  const normalizedName = normalizeCompanyName(name);
  const identityKey = registrationNumber
    ? `registration:${registrationNumber}`
    : `fallback:${normalizedName}:${address ?? ""}`;
  const employeeCount = parseInteger(row["가입자수"]);
  const monthlyBilledAmount = parseInteger(row["당월고지금액"]);
  const salary = estimateSalary(monthlyBilledAmount, employeeCount);

  return {
    snapshotMonth: normalizeSnapshotMonth(row["자료생성년월"]),
    name,
    normalizedName,
    registrationNumber,
    identityKey,
    subscriptionStatusCode: row["사업장가입상태코드"].trim() || null,
    roadAddress,
    lotAddress,
    address,
    industry: row["사업장업종코드명"].trim() || null,
    employeeCount,
    monthlyBilledAmount,
    newJoiners: parseInteger(row["신규취득자수"]),
    departures: parseInteger(row["상실가입자수"]),
    ...salary
  };
}

export function fileChecksum(filePath: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export async function importNpsCsv(filePath: string, client: ReturnType<typeof createDb>) {
  const absolutePath = path.resolve(filePath);
  const checksum = fileChecksum(absolutePath);
  const duplicate = client.db.select().from(sourceFiles).where(eq(sourceFiles.checksum, checksum)).get();
  if (duplicate) {
    throw new Error(`이미 가져온 파일입니다: ${duplicate.fileName} (${duplicate.checksum})`);
  }

  const text = fs.readFileSync(absolutePath, "utf8");
  const rawRows = parseCsv(text);
  validateRequiredColumns(rawRows);
  const parsedRows = rawRows.map((row) => parseNpsRow(row as NpsRawRow));
  const snapshotMonths = new Set(parsedRows.map((row) => row.snapshotMonth));
  if (snapshotMonths.size !== 1) {
    throw new Error(`파일에는 하나의 자료생성년월만 있어야 합니다: ${Array.from(snapshotMonths).join(", ")}`);
  }

  const now = new Date().toISOString();
  const snapshotMonth = parsedRows[0].snapshotMonth;

  return client.sqlite.transaction(() => {
    const sourceFile = client.db
      .insert(sourceFiles)
      .values({
        sourceName: NPS_SOURCE_NAME,
        sourceUrl: NPS_SOURCE_URL,
        fileName: path.basename(absolutePath),
        snapshotMonth,
        checksum,
        rowCount: parsedRows.length,
        importedAt: now
      })
      .returning()
      .get();

    let companyCount = 0;
    let snapshotCount = 0;

    for (const row of parsedRows) {
      const company = client.db
        .insert(companies)
        .values({
          identityKey: row.identityKey,
          registrationNumber: row.registrationNumber,
          name: row.name,
          normalizedName: row.normalizedName,
          industry: row.industry,
          address: row.address,
          roadAddress: row.roadAddress,
          lotAddress: row.lotAddress,
          createdAt: now,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: companies.identityKey,
          set: {
            registrationNumber: row.registrationNumber,
            name: row.name,
            normalizedName: row.normalizedName,
            industry: row.industry,
            address: row.address,
            roadAddress: row.roadAddress,
            lotAddress: row.lotAddress,
            updatedAt: now
          }
        })
        .returning()
        .get();

      companyCount += 1;

      client.db
        .insert(companySnapshots)
        .values({
          companyId: company.id,
          sourceFileId: sourceFile.id,
          snapshotMonth: row.snapshotMonth,
          subscriptionStatusCode: row.subscriptionStatusCode,
          employeeCount: row.employeeCount,
          monthlyBilledAmount: row.monthlyBilledAmount,
          newJoiners: row.newJoiners,
          departures: row.departures,
          estimatedAverageMonthlySalary: row.estimatedAverageMonthlySalary,
          estimatedAverageAnnualSalary: row.estimatedAverageAnnualSalary,
          createdAt: now
        })
        .run();
      snapshotCount += 1;
    }

    return {
      sourceFile,
      companyCount,
      snapshotCount
    };
  })();
}
