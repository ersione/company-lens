import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
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

const columnAliases: Record<string, NpsColumn> = {
  "사업장가입상태코드 1 등록 2 탈퇴": "사업장가입상태코드"
};

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

  const headers = rows[0].map((header) => canonicalColumnName(header.trim()));
  return rows.slice(1).map((values) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (values[index] ?? "").trim();
    });
    return record;
  });
}

export function canonicalColumnName(column: string) {
  return columnAliases[column] ?? column;
}

export function decodeCsvFile(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) {
    return utf8;
  }

  return new TextDecoder("euc-kr", { fatal: false }).decode(buffer);
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
  const identityBasis = `${normalizedName}:${address ?? ""}`;
  const identityKey = registrationNumber
    ? `registration:${registrationNumber}:${identityBasis}`
    : `fallback:${identityBasis}`;
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
  const duplicate = client.sqlite.prepare("SELECT file_name AS fileName, checksum FROM source_files WHERE checksum = ?").get(
    checksum
  ) as { fileName: string; checksum: string } | undefined;
  if (duplicate) {
    throw new Error(`이미 가져온 파일입니다: ${duplicate.fileName} (${duplicate.checksum})`);
  }

  const text = decodeCsvFile(absolutePath);
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
    const sourceFile = client.sqlite
      .prepare(
        `
        INSERT INTO source_files (
          source_name,
          source_url,
          file_name,
          snapshot_month,
          checksum,
          row_count,
          imported_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING
          id,
          source_name AS sourceName,
          source_url AS sourceUrl,
          file_name AS fileName,
          snapshot_month AS snapshotMonth,
          checksum,
          row_count AS rowCount,
          imported_at AS importedAt
      `
      )
      .get(NPS_SOURCE_NAME, NPS_SOURCE_URL, path.basename(absolutePath), snapshotMonth, checksum, parsedRows.length, now) as {
      id: number;
      sourceName: string;
      sourceUrl: string;
      fileName: string;
      snapshotMonth: string;
      checksum: string;
      rowCount: number;
      importedAt: string;
    };

    const upsertCompany = client.sqlite.prepare(
      `
      INSERT INTO companies (
        identity_key,
        registration_number,
        name,
        normalized_name,
        industry,
        address,
        road_address,
        lot_address,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(identity_key) DO UPDATE SET
        registration_number = excluded.registration_number,
        name = excluded.name,
        normalized_name = excluded.normalized_name,
        industry = excluded.industry,
        address = excluded.address,
        road_address = excluded.road_address,
        lot_address = excluded.lot_address,
        updated_at = excluded.updated_at
      RETURNING id
    `
    );

    const upsertSnapshot = client.sqlite.prepare(
      `
      INSERT INTO company_snapshots (
        company_id,
        source_file_id,
        snapshot_month,
        subscription_status_code,
        employee_count,
        monthly_billed_amount,
        new_joiners,
        departures,
        estimated_average_monthly_salary,
        estimated_average_annual_salary,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(company_id, snapshot_month, source_file_id) DO UPDATE SET
        subscription_status_code = excluded.subscription_status_code,
        employee_count = excluded.employee_count,
        monthly_billed_amount = excluded.monthly_billed_amount,
        new_joiners = excluded.new_joiners,
        departures = excluded.departures,
        estimated_average_monthly_salary = excluded.estimated_average_monthly_salary,
        estimated_average_annual_salary = excluded.estimated_average_annual_salary
    `
    );

    let companyCount = 0;
    let snapshotCount = 0;

    for (const row of parsedRows) {
      const company = upsertCompany.get(
        row.identityKey,
        row.registrationNumber,
        row.name,
        row.normalizedName,
        row.industry,
        row.address,
        row.roadAddress,
        row.lotAddress,
        now,
        now
      ) as { id: number };

      companyCount += 1;

      upsertSnapshot.run(
        company.id,
        sourceFile.id,
        row.snapshotMonth,
        row.subscriptionStatusCode,
        row.employeeCount,
        row.monthlyBilledAmount,
        row.newJoiners,
        row.departures,
        row.estimatedAverageMonthlySalary,
        row.estimatedAverageAnnualSalary,
        now
      );
      snapshotCount += 1;
    }

    return {
      sourceFile,
      companyCount,
      snapshotCount
    };
  })();
}
