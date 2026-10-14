import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { getDatabasePath } from "@/db/client";
import { regions, regionLabels } from "@/lib/company-search-options";
import { pensionRateForMonth } from "@/lib/pension";
import { monthOffset } from "@/lib/company-insights";

export type StatisticsDimension = "total" | "industry" | "region";
export type StatisticsRow = {
  dimension: StatisticsDimension; key: string; month: string; sourceId: number;
  workplaceCount: number; subscriberCount: number; unknownEmployeeCount: number;
  newJoiners: number; departures: number; salarySubscriberCount: number;
  annualSalary: number | null; generatedAt: string;
};

export function statisticsRegion(address: string | null) {
  const prefix = address?.trim().split(/\s+/)[0] ?? "";
  const aliases: Record<string, string> = { 강원도: "강원특별자치도", 전라북도: "전북특별자치도", 제주도: "제주특별자치도" };
  const normalized = aliases[prefix] ?? prefix;
  const index = regions.findIndex((region, i) => region === normalized || regionLabels[i] === normalized);
  return index < 0 ? "지역 정보 없음" : regions[index];
}

export function createPublicStatisticsTable(sqlite: Database.Database) {
  sqlite.exec(`CREATE TABLE IF NOT EXISTS employment_monthly_cube (
    snapshot_month TEXT NOT NULL, industry TEXT NOT NULL, region TEXT NOT NULL, size_band INTEGER NOT NULL,
    source_file_id INTEGER NOT NULL REFERENCES source_files(id),
    workplace_count INTEGER NOT NULL, subscriber_count INTEGER NOT NULL, unknown_employee_count INTEGER NOT NULL,
    new_joiners INTEGER NOT NULL, departures INTEGER NOT NULL,
    unknown_joiner_count INTEGER NOT NULL, unknown_departure_count INTEGER NOT NULL,
    salary_workplace_count INTEGER NOT NULL, salary_subscriber_count INTEGER NOT NULL,
    salary_billed_amount INTEGER NOT NULL, generated_at TEXT NOT NULL,
    PRIMARY KEY (snapshot_month, industry, region, size_band)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS employment_cube_months (
    snapshot_month TEXT PRIMARY KEY, source_file_id INTEGER NOT NULL REFERENCES source_files(id),
    generated_at TEXT NOT NULL, cube_row_count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS public_monthly_statistics (
    dimension TEXT NOT NULL CHECK (dimension IN ('total', 'industry', 'region')),
    dimension_key TEXT NOT NULL, snapshot_month TEXT NOT NULL,
    source_file_id INTEGER NOT NULL REFERENCES source_files(id),
    workplace_count INTEGER NOT NULL, subscriber_count INTEGER NOT NULL,
    unknown_employee_count INTEGER NOT NULL, new_joiners INTEGER NOT NULL, departures INTEGER NOT NULL,
    salary_subscriber_count INTEGER NOT NULL, annual_salary REAL, generated_at TEXT NOT NULL,
    PRIMARY KEY (dimension, dimension_key, snapshot_month)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS public_statistics_month_idx
    ON public_monthly_statistics(dimension, snapshot_month, subscriber_count DESC);
  CREATE TABLE IF NOT EXISTS public_yearly_statistics (
    dimension TEXT NOT NULL, dimension_key TEXT NOT NULL, year TEXT NOT NULL,
    first_month TEXT NOT NULL, last_month TEXT NOT NULL, month_count INTEGER NOT NULL,
    average_workplace_count REAL NOT NULL, average_subscriber_count REAL NOT NULL,
    end_workplace_count INTEGER NOT NULL, end_subscriber_count INTEGER NOT NULL,
    new_joiners INTEGER NOT NULL, departures INTEGER NOT NULL,
    salary_subscriber_months INTEGER NOT NULL, annual_salary REAL, generated_at TEXT NOT NULL,
    PRIMARY KEY (dimension, dimension_key, year)
  ) WITHOUT ROWID;`);
}

// Run only during imports or explicit maintenance, never from a page request.
export function refreshPublicStatistics(sqlite: Database.Database, month: string) {
  sqlite.function("statistics_region", { deterministic: true }, statisticsRegion);
  const source = sqlite.prepare(`SELECT id FROM source_files WHERE snapshot_month = ?
    ORDER BY COALESCE(published_at, '') DESC, id DESC LIMIT 1`).get(month) as { id: number } | undefined;
  if (!source) return;
  const now = new Date().toISOString();
  const sums = `COALESCE(SUM(workplace_count), 0), COALESCE(SUM(subscriber_count), 0), COALESCE(SUM(unknown_employee_count), 0),
    COALESCE(SUM(new_joiners), 0), COALESCE(SUM(departures), 0), COALESCE(SUM(salary_subscriber_count), 0),
    SUM(salary_billed_amount) * 12.0 / ? / NULLIF(SUM(salary_subscriber_count), 0)`;
  sqlite.transaction(() => {
    sqlite.prepare("DELETE FROM employment_monthly_cube WHERE snapshot_month = ?").run(month);
    sqlite.prepare(`INSERT INTO employment_monthly_cube
      SELECT ?, CASE WHEN s.industry IS NULL OR TRIM(s.industry) IN ('', 'BIZ_NO미존재사업장', '해당없음')
        THEN '업종 정보 없음' ELSE TRIM(s.industry) END AS industry,
        statistics_region(c.address) AS region,
        CASE WHEN s.employee_count IS NULL THEN -1 WHEN s.employee_count = 0 THEN 0
          WHEN s.employee_count < 10 THEN 1 WHEN s.employee_count < 50 THEN 2
          WHEN s.employee_count < 300 THEN 3 WHEN s.employee_count < 1000 THEN 4 ELSE 5 END AS size_band,
        ?, COUNT(*), COALESCE(SUM(s.employee_count), 0), SUM(s.employee_count IS NULL),
        COALESCE(SUM(s.new_joiners), 0), COALESCE(SUM(s.departures), 0),
        SUM(s.new_joiners IS NULL), SUM(s.departures IS NULL),
        COALESCE(SUM(s.employee_count > 0 AND s.monthly_billed_amount > 0), 0),
        COALESCE(SUM(CASE WHEN s.employee_count > 0 AND s.monthly_billed_amount > 0 THEN s.employee_count END), 0),
        COALESCE(SUM(CASE WHEN s.employee_count > 0 AND s.monthly_billed_amount > 0 THEN s.monthly_billed_amount END), 0), ?
      FROM company_snapshots s CROSS JOIN companies c ON c.id = s.company_id
      WHERE s.source_file_id = ? AND s.snapshot_month = ? AND s.subscription_status_code = '1'
      GROUP BY 2, 3, 4`).run(month, source.id, now, source.id, month);
    sqlite.prepare("DELETE FROM public_monthly_statistics WHERE snapshot_month = ?").run(month);
    sqlite.prepare(`WITH eligible AS MATERIALIZED (
      SELECT * FROM employment_monthly_cube WHERE snapshot_month = ?
    ), grouped(dimension, dimension_key, workplace_count, subscriber_count, unknown_employee_count,
      new_joiners, departures, salary_subscriber_count, annual_salary) AS (
      SELECT 'total' AS dimension, '전국' AS dimension_key, ${sums} FROM eligible
      UNION ALL SELECT 'industry', industry, ${sums} FROM eligible GROUP BY industry
      UNION ALL SELECT 'region', region, ${sums} FROM eligible GROUP BY region
    ) INSERT INTO public_monthly_statistics
      SELECT dimension, dimension_key, ?, ?, workplace_count, subscriber_count, COALESCE(unknown_employee_count, 0),
        new_joiners, departures, salary_subscriber_count, annual_salary, ? FROM grouped`)
      .run(month, pensionRateForMonth(month), pensionRateForMonth(month), pensionRateForMonth(month), month, source.id, now);
    sqlite.prepare(`INSERT INTO employment_cube_months VALUES (?, ?, ?,
      (SELECT COUNT(*) FROM employment_monthly_cube WHERE snapshot_month = ?))
      ON CONFLICT(snapshot_month) DO UPDATE SET source_file_id = excluded.source_file_id,
        generated_at = excluded.generated_at, cube_row_count = excluded.cube_row_count`).run(month, source.id, now, month);
    refreshYearlyStatistics(sqlite, month.slice(0, 4), now);
  }).immediate();
}

function refreshYearlyStatistics(sqlite: Database.Database, year: string, now: string) {
  sqlite.prepare("DELETE FROM public_yearly_statistics WHERE year = ?").run(year);
  sqlite.prepare(`WITH coverage AS (
    SELECT MIN(snapshot_month) AS first_month, MAX(snapshot_month) AS last_month, COUNT(*) AS months
    FROM public_monthly_statistics WHERE dimension = 'total' AND snapshot_month BETWEEN ? AND ?
  ) INSERT INTO public_yearly_statistics
    SELECT dimension, dimension_key, ?, coverage.first_month, coverage.last_month, coverage.months,
      SUM(workplace_count) * 1.0 / coverage.months, SUM(subscriber_count) * 1.0 / coverage.months,
      SUM(CASE WHEN snapshot_month = coverage.last_month THEN workplace_count ELSE 0 END),
      SUM(CASE WHEN snapshot_month = coverage.last_month THEN subscriber_count ELSE 0 END),
      SUM(new_joiners), SUM(departures), SUM(salary_subscriber_count),
      SUM(annual_salary * salary_subscriber_count) / NULLIF(SUM(salary_subscriber_count), 0), ?
    FROM public_monthly_statistics CROSS JOIN coverage WHERE snapshot_month BETWEEN ? AND ?
    GROUP BY dimension, dimension_key`).run(`${year}-01`, `${year}-12`, year, now, `${year}-01`, `${year}-12`);
}

export function rebuildPublicAnnualStatistics(sqlite: Database.Database) {
  const years = sqlite.prepare(`SELECT DISTINCT SUBSTR(snapshot_month, 1, 4) AS year
    FROM public_monthly_statistics WHERE dimension = 'total' ORDER BY year`).all() as { year: string }[];
  sqlite.transaction(() => {
    for (const { year } of years) refreshYearlyStatistics(sqlite, year, new Date().toISOString());
  }).immediate();
  return years.length;
}

export type YearlyStatisticsRow = {
  year: string; firstMonth: string; lastMonth: string; monthCount: number;
  averageWorkplaceCount: number; averageSubscriberCount: number; endWorkplaceCount: number; endSubscriberCount: number;
  newJoiners: number; departures: number; salarySubscriberMonths: number; annualSalary: number | null;
};

export function getYearlyStatistics(dimension: StatisticsDimension, key: string): YearlyStatisticsRow[] {
  return read([], (sqlite) => sqlite.prepare(`SELECT year, first_month AS firstMonth, last_month AS lastMonth,
    month_count AS monthCount, average_workplace_count AS averageWorkplaceCount, average_subscriber_count AS averageSubscriberCount,
    end_workplace_count AS endWorkplaceCount, end_subscriber_count AS endSubscriberCount,
    new_joiners AS newJoiners, departures, salary_subscriber_months AS salarySubscriberMonths, annual_salary AS annualSalary
    FROM public_yearly_statistics WHERE dimension = ? AND dimension_key = ? ORDER BY year DESC`).all(dimension, key) as YearlyStatisticsRow[], "public_yearly_statistics");
}

const columns = `dimension, dimension_key AS key, snapshot_month AS month, source_file_id AS sourceId,
  workplace_count AS workplaceCount, subscriber_count AS subscriberCount,
  unknown_employee_count AS unknownEmployeeCount, new_joiners AS newJoiners, departures,
  salary_subscriber_count AS salarySubscriberCount, annual_salary AS annualSalary, generated_at AS generatedAt`;

function read<T>(empty: T, query: (sqlite: Database.Database) => T, table = "public_monthly_statistics"): T {
  const file = getDatabasePath();
  if (!existsSync(file)) return empty;
  const sqlite = new Database(file, { readonly: true, fileMustExist: true });
  sqlite.pragma("busy_timeout = 5000");
  try {
    if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(table)) return empty;
    return query(sqlite);
  } finally { sqlite.close(); }
}

export function getStatisticsHistory(dimension: StatisticsDimension, key: string): StatisticsRow[] {
  return read([], (sqlite) => sqlite.prepare(`SELECT ${columns} FROM public_monthly_statistics
    WHERE dimension = ? AND dimension_key = ? ORDER BY snapshot_month`).all(dimension, key) as StatisticsRow[]);
}

export function resolveStatisticsHistory(dimension: "industry" | "region", rawKey: string) {
  // Next may supply encoded page params but decoded metadata params. Prefer an exact stored label.
  let key = rawKey;
  let history = getStatisticsHistory(dimension, key);
  if (!history.length) {
    try { key = decodeURIComponent(rawKey); } catch { return { key: rawKey, history }; }
    if (key !== rawKey) history = getStatisticsHistory(dimension, key);
  }
  return { key, history };
}

export function getStatisticsGroups(dimension: "industry" | "region"): StatisticsRow[] {
  return read([], (sqlite) => sqlite.prepare(`SELECT ${columns} FROM public_monthly_statistics
    WHERE dimension = ? AND snapshot_month = (SELECT MAX(snapshot_month) FROM public_monthly_statistics WHERE dimension = 'total')
    ORDER BY subscriber_count DESC, dimension_key`).all(dimension) as StatisticsRow[]);
}

export function statisticsHref(dimension: "industry" | "region", key?: string) {
  const path = dimension === "industry" ? "/industries" : "/regions";
  return key ? `${path}/${encodeURIComponent(key)}` : path;
}

export function isKnownStatisticsGroup(row: { key: string }) {
  return !["업종 정보 없음", "지역 정보 없음", "복수 업종"].includes(row.key);
}

export function statisticsChange(history: StatisticsRow[], months: number) {
  const latest = history.at(-1);
  const previous = latest && history.find((row) => row.month === monthOffset(latest.month, -months));
  if (!latest || !previous) return null;
  return { count: latest.subscriberCount - previous.subscriberCount,
    percent: previous.subscriberCount > 0 ? (latest.subscriberCount / previous.subscriberCount - 1) * 100 : null };
}

export type IndustryEmploymentChange = {
  key: string; subscriberCount: number; previousCount: number; workplaceCount: number;
  change: number; percent: number | null;
};
export type EmploymentChangeOptions = { months: 1 | 3 | 12; direction: "increase" | "decrease"; sort: "count" | "rate" };
export const employmentRateMinimum = 1000;

export function rankEmploymentChanges(rows: IndustryEmploymentChange[], options: EmploymentChangeOptions) {
  const sign = options.direction === "increase" ? 1 : -1;
  return rows.filter((row) => isKnownStatisticsGroup(row) && sign * row.change > 0 &&
    (options.sort !== "rate" || (row.previousCount >= employmentRateMinimum && row.subscriberCount >= employmentRateMinimum && row.percent !== null)))
    .sort((a, b) => sign * ((options.sort === "rate" ? b.percent! - a.percent! : b.change - a.change)) ||
      sign * (b.change - a.change) || a.key.localeCompare(b.key, "ko"));
}

// Compare only the small monthly serving table, never workplace snapshots or the cube.
export function getIndustryEmploymentChanges(months: 1 | 3 | 12): {
  month: string | null; previousMonth: string | null; hasBaseline: boolean; rows: IndustryEmploymentChange[];
} {
  return read({ month: null, previousMonth: null, hasBaseline: false, rows: [] }, (sqlite) => {
    const latest = sqlite.prepare("SELECT MAX(snapshot_month) AS month FROM public_monthly_statistics WHERE dimension = 'total'").get() as { month: string | null };
    if (!latest.month) return { month: null, previousMonth: null, hasBaseline: false, rows: [] };
    const previousMonth = monthOffset(latest.month, -months);
    const hasBaseline = !!sqlite.prepare("SELECT 1 FROM public_monthly_statistics WHERE dimension = 'total' AND snapshot_month = ?").get(previousMonth);
    const rows = sqlite.prepare(`SELECT current.dimension_key AS key, current.subscriber_count AS subscriberCount,
      previous.subscriber_count AS previousCount, current.workplace_count AS workplaceCount,
      current.subscriber_count - previous.subscriber_count AS change,
      (current.subscriber_count - previous.subscriber_count) * 100.0 / NULLIF(previous.subscriber_count, 0) AS percent
      FROM public_monthly_statistics current JOIN public_monthly_statistics previous
        ON previous.dimension = current.dimension AND previous.dimension_key = current.dimension_key AND previous.snapshot_month = ?
      WHERE current.dimension = 'industry' AND current.snapshot_month = ?`).all(previousMonth, latest.month) as IndustryEmploymentChange[];
    return { month: latest.month, previousMonth, hasBaseline, rows };
  });
}

export type EmploymentBreakdown = {
  month: string; workplaceCount: number; subscriberCount: number; unknownEmployeeCount: number;
  newJoiners: number; departures: number; unknownJoinerCount: number; unknownDepartureCount: number;
  salaryWorkplaceCount: number; salarySubscriberCount: number; salaryBilledAmount: number;
};
export const statisticsSizeBands = ["인원 미상", "0명", "1~9명", "10~49명", "50~299명", "300~999명", "1,000명 이상"];

// Additive measures allow cross-filtering without revisiting company history or averaging averages.
export function getEmploymentBreakdown(filters: { from: string; to: string; industry?: string; region?: string; sizeBand?: number }): EmploymentBreakdown[] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.from) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(filters.to) || filters.from > filters.to)
    throw new Error("Invalid month range");
  if (filters.sizeBand !== undefined && (!Number.isInteger(filters.sizeBand) || filters.sizeBand < -1 || filters.sizeBand > 5))
    throw new Error("Invalid size band");
  return read([], (sqlite) => {
    const clauses = ["snapshot_month >= ?", "snapshot_month <= ?"];
    const values: (string | number)[] = [filters.from, filters.to];
    for (const [key, column] of [["industry", "industry"], ["region", "region"], ["sizeBand", "size_band"]] as const) {
      if (filters[key] !== undefined) { clauses.push(`${column} = ?`); values.push(filters[key]); }
    }
    return sqlite.prepare(`SELECT snapshot_month AS month, SUM(workplace_count) AS workplaceCount,
      SUM(subscriber_count) AS subscriberCount, SUM(unknown_employee_count) AS unknownEmployeeCount,
      SUM(new_joiners) AS newJoiners, SUM(departures) AS departures,
      SUM(unknown_joiner_count) AS unknownJoinerCount, SUM(unknown_departure_count) AS unknownDepartureCount,
      SUM(salary_workplace_count) AS salaryWorkplaceCount, SUM(salary_subscriber_count) AS salarySubscriberCount,
      SUM(salary_billed_amount) AS salaryBilledAmount FROM employment_monthly_cube
      WHERE ${clauses.join(" AND ")} GROUP BY snapshot_month ORDER BY snapshot_month`).all(...values) as EmploymentBreakdown[];
  });
}
