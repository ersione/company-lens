import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { parse } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import iconv from "iconv-lite";
import { eq } from "drizzle-orm";
import { sourceFiles } from "@/db/schema";
import type { createDb } from "@/db/client";
import { estimateSalary } from "@/lib/pension";
import { refreshMonthlyStatistics } from "@/lib/monthly-statistics";
import { isDailyWorkerWorkplace } from "@/lib/daily-worker";
export { estimateSalary } from "@/lib/pension";

export const NPS_SOURCE_NAME = "국민연금공단 사업장 가입자 명부";
export const NPS_SOURCE_URL = "https://www.data.go.kr/data/15083277/fileData.do";

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
  return parseSync(text, csvOptions) as Record<string, string>[];
}

const csvOptions = {
  bom: true,
  trim: true,
  skip_empty_lines: true,
  columns: (headers: string[]) => headers.map((header) =>
    requiredColumns.find((column) => header.trim().startsWith(column)) ?? header.trim()
  )
};

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

  const parsed = Number(cleaned);
  if (!/^\d+$/.test(cleaned) || !Number.isSafeInteger(parsed)) {
    throw new Error(`유효한 음이 아닌 정수가 아닙니다: ${value}`);
  }
  return parsed;
}

export function normalizeSnapshotMonth(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 6 || Number(digits.slice(4, 6)) < 1 || Number(digits.slice(4, 6)) > 12) {
    throw new Error(`자료생성년월 값이 올바르지 않습니다: ${value}`);
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
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
  const identityKey = registrationNumber?.length === 10
    ? `registration:${registrationNumber}`
    : `fallback:${normalizedName}:${address ?? ""}${registrationNumber ? `:${registrationNumber}` : ""}`;
  const employeeCount = parseInteger(row["가입자수"]);
  const monthlyBilledAmount = parseInteger(row["당월고지금액"]);
  const snapshotMonth = normalizeSnapshotMonth(row["자료생성년월"]);
  const salary = estimateSalary(monthlyBilledAmount, employeeCount, snapshotMonth);

  return {
    snapshotMonth,
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

export async function fileChecksum(filePath: string) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of contentStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function contentStream(filePath: string) {
  const input = fs.createReadStream(filePath);
  if (!filePath.endsWith(".gz")) return input;
  const decoded = createGunzip();
  input.on("error", (error) => decoded.destroy(error));
  decoded.on("close", () => input.destroy());
  return input.pipe(decoded);
}

async function detectEncoding(filePath: string) {
  for await (const chunk of contentStream(filePath)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(chunk, { stream: true });
      return "utf-8";
    } catch {
      return "euc-kr";
    }
  }
  return "utf-8";
}

async function* readRows(filePath: string) {
  const parser = parse(csvOptions);
  let failure: unknown;
  const completed = pipeline(contentStream(filePath), iconv.decodeStream(await detectEncoding(filePath)), parser)
    .catch((error: unknown) => { failure = error; });
  try {
    for await (const row of parser) yield row as NpsRawRow;
    await completed;
    if (failure) throw failure;
  } finally {
    parser.destroy();
    await completed;
  }
}

export async function importNpsCsv(filePath: string, client: ReturnType<typeof createDb>, onProgress?: (rows: number) => void,
  options: { publishedAt?: string } = {}) {
  client.sqlite.pragma("cache_size = -131072");
  const absolutePath = path.resolve(filePath);
  const checksum = await fileChecksum(absolutePath);
  const duplicate = client.db.select().from(sourceFiles).where(eq(sourceFiles.checksum, checksum)).get();
  if (duplicate) {
    throw new Error(`이미 가져온 파일입니다: ${duplicate.fileName} (${duplicate.checksum})`);
  }

  const now = new Date().toISOString();
  const fileDate = path.basename(absolutePath).match(/(?:^|\D)((?:19|20)\d{2})(\d{2})(\d{2})(?=\D|$)/)?.slice(1).join("-");
  const publishedAt = options.publishedAt ?? fileDate ?? null;
  if (publishedAt) {
    const timestamp = Date.parse(`${publishedAt}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== publishedAt) {
      throw new Error(`공개일이 올바르지 않습니다: ${publishedAt}`);
    }
  }
  const upsertCompanies = `
    INSERT INTO companies (identity_key, registration_number, name, normalized_name, industry, address, road_address, lot_address, created_at, updated_at, latest_snapshot_month)
    SELECT identity_key, registration_number, name, normalized_name, industry, address, road_address,
      lot_address, @now, @now, @snapshotMonth FROM nps_import_groups WHERE 1
    ON CONFLICT(identity_key) DO UPDATE SET
      ${["registration_number", "name", "normalized_name", "address", "road_address", "lot_address", "updated_at"].map((column) =>
        `${column} = CASE WHEN excluded.latest_snapshot_month >= companies.latest_snapshot_month THEN excluded.${column} ELSE companies.${column} END`).join(",\n")},
      industry = CASE WHEN excluded.latest_snapshot_month < companies.latest_snapshot_month THEN companies.industry
        ELSE excluded.industry END,
      latest_snapshot_month = MAX(companies.latest_snapshot_month, excluded.latest_snapshot_month)
    WHERE excluded.latest_snapshot_month >= companies.latest_snapshot_month
      AND (${["registration_number", "name", "normalized_name", "industry", "address", "road_address", "lot_address"].map((column) =>
        `companies.${column} IS NOT excluded.${column}`).join(" OR ")})
      AND @sourceFileId = (SELECT id FROM source_files WHERE snapshot_month = @snapshotMonth
        ORDER BY COALESCE(published_at, '') DESC, id DESC LIMIT 1)
  `;
  const insertSnapshots = `
    INSERT INTO company_snapshots (company_id, source_file_id, snapshot_month, subscription_status_code,
      employee_count, monthly_billed_amount, new_joiners, departures, industry)
    SELECT c.id, @sourceFileId, @snapshotMonth, g.subscription_status_code,
      g.employee_count, g.monthly_billed_amount, g.new_joiners, g.departures, g.industry
    FROM nps_import_groups g JOIN companies c ON c.identity_key = g.identity_key ORDER BY c.id
  `;
  let sourceFile: typeof sourceFiles.$inferSelect | undefined;
  let rowCount = 0;
  let excludedRowCount = 0;
  client.sqlite.exec("BEGIN IMMEDIATE");
  try {
    client.sqlite.exec(`CREATE TEMP TABLE nps_import_rows (
      identity_key TEXT, registration_number TEXT, name TEXT, normalized_name TEXT, industry TEXT,
      address TEXT, road_address TEXT, lot_address TEXT, subscription_status_code TEXT,
      employee_count INTEGER, monthly_billed_amount INTEGER, new_joiners INTEGER, departures INTEGER
    );`);
    const stage = client.sqlite.prepare(`INSERT INTO nps_import_rows VALUES (@identityKey, @registrationNumber,
      @name, @normalizedName, @industry, @address, @roadAddress, @lotAddress, @subscriptionStatusCode,
      @employeeCount, @monthlyBilledAmount, @newJoiners, @departures)`);
    for await (const rawRow of readRows(absolutePath)) {
      if (rowCount === 0) validateRequiredColumns([rawRow]);
      const row = parseNpsRow(rawRow);
      if (!sourceFile) {
        sourceFile = client.db.insert(sourceFiles).values({
          sourceName: NPS_SOURCE_NAME, sourceUrl: NPS_SOURCE_URL,
          fileName: path.basename(absolutePath), snapshotMonth: row.snapshotMonth,
          checksum, rowCount: 0, importedAt: now, publishedAt
        }).returning().get();
      }
      if (row.snapshotMonth !== sourceFile.snapshotMonth) throw new Error("파일에는 하나의 자료생성년월만 있어야 합니다.");
      if (isDailyWorkerWorkplace(row.name)) excludedRowCount += 1;
      else stage.run(row);
      rowCount += 1;
      if (rowCount % 50000 === 0) onProgress?.(rowCount);
    }
    if (!sourceFile) throw new Error("CSV 파일에 데이터 행이 없습니다.");
    // Group in SQLite, then write company-ordered snapshots to keep index updates local.
    client.sqlite.exec(`CREATE TEMP TABLE nps_import_groups AS SELECT identity_key,
      MAX(registration_number) AS registration_number, MAX(name) AS name, MAX(normalized_name) AS normalized_name,
      CASE WHEN COUNT(DISTINCT COALESCE(industry, '')) > 1 THEN '복수 업종' ELSE MAX(industry) END AS industry,
      MAX(address) AS address, MAX(road_address) AS road_address, MAX(lot_address) AS lot_address,
      CASE WHEN MAX(subscription_status_code = '1') = 1 THEN '1' ELSE MAX(subscription_status_code) END AS subscription_status_code,
      ${["employee_count", "monthly_billed_amount", "new_joiners", "departures"].map((column) =>
        `CASE WHEN COUNT(${column}) = COUNT(*) THEN SUM(${column}) END AS ${column}`).join(",\n")}
      FROM nps_import_rows GROUP BY identity_key;
      DROP TABLE nps_import_rows;`);
    // Preserve observed names before metadata changes. A month range is not a legal rename date.
    client.sqlite.prepare(`INSERT INTO company_name_observations
      SELECT c.id, c.name, c.latest_snapshot_month, c.latest_snapshot_month
      FROM nps_import_groups g JOIN companies c ON c.identity_key = g.identity_key
      WHERE c.latest_snapshot_month != ''
      ON CONFLICT(company_id, name) DO UPDATE SET
        first_seen_month = MIN(first_seen_month, excluded.first_seen_month),
        last_seen_month = MAX(last_seen_month, excluded.last_seen_month)`).run();
    client.sqlite.prepare(upsertCompanies).run({ now, snapshotMonth: sourceFile.snapshotMonth, sourceFileId: sourceFile.id });
    client.sqlite.prepare(`INSERT INTO company_name_observations
      SELECT c.id, g.name, ?, ? FROM nps_import_groups g JOIN companies c ON c.identity_key = g.identity_key WHERE 1
      ON CONFLICT(company_id, name) DO UPDATE SET
        first_seen_month = MIN(first_seen_month, excluded.first_seen_month),
        last_seen_month = MAX(last_seen_month, excluded.last_seen_month)`)
      .run(sourceFile.snapshotMonth, sourceFile.snapshotMonth);
    client.sqlite.prepare(`UPDATE companies SET latest_snapshot_month = @snapshotMonth, updated_at = @now
      WHERE latest_snapshot_month < @snapshotMonth AND id IN (
        SELECT c.id FROM nps_import_groups g JOIN companies c ON c.identity_key = g.identity_key
      ) AND @sourceFileId = (SELECT id FROM source_files WHERE snapshot_month = @snapshotMonth
        ORDER BY COALESCE(published_at, '') DESC, id DESC LIMIT 1)`)
      .run({ now, snapshotMonth: sourceFile.snapshotMonth, sourceFileId: sourceFile.id });
    client.sqlite.prepare(insertSnapshots).run({ snapshotMonth: sourceFile.snapshotMonth, sourceFileId: sourceFile.id });
    client.sqlite.exec("DROP TABLE nps_import_groups;");
    client.db.update(sourceFiles).set({ rowCount }).where(eq(sourceFiles.id, sourceFile.id)).run();
    const { count } = client.sqlite.prepare("SELECT COUNT(*) AS count FROM company_snapshots WHERE source_file_id = ?").get(sourceFile.id) as { count: number };
    refreshMonthlyStatistics(client.sqlite, sourceFile.snapshotMonth);
    client.sqlite.exec("COMMIT");
    return { sourceFile: { ...sourceFile, rowCount }, companyCount: count, snapshotCount: count, rowCount,
      excludedRowCount, aggregatedRowCount: rowCount - excludedRowCount - count };
  } catch (error) {
    client.sqlite.exec("ROLLBACK");
    throw error;
  }
}
