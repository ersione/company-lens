import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";
import type { Distribution } from "@/db/schema";
import { searchIndexMatch } from "@/lib/company-search-index";
import { estimatedMonthlySalarySql } from "@/lib/pension";
import type { CompanyBenchmark } from "@/lib/company-benchmarks";
import { regionPrefixes, type SearchOptions } from "@/lib/company-search-options";
import { canonicalSnapshotSql, hasCompanyLatest } from "@/lib/company-latest";

const monthlySalary = estimatedMonthlySalarySql("s");

const canonicalSnapshot = canonicalSnapshotSql;

export type CompanySearchResult = {
  id: number;
  name: string;
  industry: string | null;
  address: string | null;
  snapshotMonth: string | null;
  employeeCount: number | null;
  estimatedAverageAnnualSalary: number | null;
  newJoiners: number | null;
  departures: number | null;
};

export type CompanyDetail = CompanySearchResult & {
  registrationNumber: string | null;
  roadAddress: string | null;
  lotAddress: string | null;
  sourceFileName: string | null;
  sourceImportedAt: string | null;
  monthlyBilledAmount: number | null;
  estimatedAverageMonthlySalary: number | null;
};

export type SnapshotHistory = {
  snapshotMonth: string;
  employeeCount: number | null;
  estimatedAverageAnnualSalary: number | null;
  newJoiners: number | null;
  departures: number | null;
};

function withDatabase<T>(callback: (sqlite: ReturnType<typeof createDb>["sqlite"]) => T) {
  const client = createDb();
  try {
    migrate(client.sqlite);
    return callback(client.sqlite);
  } finally {
    client.sqlite.close();
  }
}

export function getCompanyBenchmark(id: number, month: string | null) {
  if (!month) return undefined;
  return withDatabase((sqlite) => sqlite.prepare(`SELECT employee_top_percent AS employeeTopPercent,
    salary_top_percent AS salaryTopPercent, industry_employee_top_percent AS industryEmployeeTopPercent,
    industry_salary_top_percent AS industrySalaryTopPercent, employee_sample_count AS employeeSampleCount,
    salary_sample_count AS salarySampleCount, industry_employee_sample_count AS industryEmployeeSampleCount,
    industry_salary_sample_count AS industrySalarySampleCount FROM company_benchmarks b
    WHERE company_id = ? AND b.snapshot_month = ? AND EXISTS (
      SELECT 1 FROM monthly_statistics m WHERE m.snapshot_month = b.snapshot_month AND m.source_file_id = b.source_file_id
    )`).get(id, month) as CompanyBenchmark | undefined);
}

export function getDatasetStatus() {
  return withDatabase((sqlite) => sqlite.prepare(`
    SELECT snapshot_month AS snapshotMonth, row_count AS rowCount, imported_at AS importedAt
    FROM source_files ORDER BY snapshot_month DESC, id DESC LIMIT 1
  `).get() as { snapshotMonth: string; rowCount: number; importedAt: string } | undefined);
}

export function searchCompanyPage(query: string, options: SearchOptions, limit = 20) {
  const matches = searchCompanies(query, limit + 1, { ...options, offset: (options.page - 1) * limit });
  return { results: matches.slice(0, limit), hasMore: matches.length > limit };
}

export function searchCompanies(query: string, limit = 20, options: Partial<SearchOptions> & { offset?: number } = {}) {
  return withDatabase((sqlite) => {
    const normalizedQuery = `%${query.trim().toLocaleLowerCase("ko-KR")}%`;
    const registrationQuery = /^[\d\s-]+$/.test(query.trim()) ? query.replace(/\D/g, "") : "";
    if (!query.trim()) {
      const months = sqlite.prepare(`SELECT DISTINCT snapshot_month AS month
        FROM company_snapshots ORDER BY snapshot_month DESC`).all() as { month: string }[];
      // Limit name-ordered candidates before fetching their snapshot values.
      const selectPage = sqlite.prepare(
          `
          WITH candidates AS MATERIALIZED (
            SELECT c.id FROM companies c INDEXED BY companies_name_order_idx
            WHERE (SELECT s2.snapshot_month FROM company_snapshots s2
              WHERE s2.company_id = c.id AND ${canonicalSnapshot}
              ORDER BY s2.snapshot_month DESC, s2.id DESC LIMIT 1) IS ?
            ORDER BY c.name ASC, c.id ASC LIMIT ?
          )
          SELECT
            c.id,
            c.name,
            c.industry,
            c.address,
            s.snapshot_month AS snapshotMonth,
            s.employee_count AS employeeCount,
            (${monthlySalary}) * 12 AS estimatedAverageAnnualSalary,
            s.new_joiners AS newJoiners,
            s.departures
          FROM candidates candidate
          JOIN companies c ON c.id = candidate.id
          LEFT JOIN company_snapshots s
            ON s.id = (
              SELECT s2.id
              FROM company_snapshots s2
              WHERE s2.company_id = c.id AND ${canonicalSnapshot}
              ORDER BY s2.snapshot_month DESC, s2.id DESC
              LIMIT 1
            )
          ORDER BY c.name ASC, c.id ASC
        `
      );
      const results: CompanySearchResult[] = [];
      for (const month of [...months.map(({ month }) => month), null]) {
        if (results.length >= limit) break;
        results.push(...selectPage.all(month, limit - results.length) as CompanySearchResult[]);
      }
      return results;
    }

    const indexMatch = searchIndexMatch(query, registrationQuery);
    const indexed = indexMatch !== undefined && sqlite.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'company_search'"
    ).get();
    const prefix = query.trim().toLocaleLowerCase("ko-KR");
    const prefixEnd = `${prefix}\uffff`;
    // Prefix matches always rank ahead of contains matches. If they fill the page,
    // short searches can avoid a full scan without changing the top results.
    const prefixOnly = !indexed && !registrationQuery && !options.region && !options.minEmployees
      && !options.offset && options.sort !== "employees" && !/[%_]/.test(prefix)
      && sqlite.prepare(`SELECT id FROM companies INDEXED BY companies_name_idx
        WHERE normalized_name >= ? AND normalized_name < ? LIMIT ?`)
        .all(prefix, prefixEnd, limit).length === limit;
    const matches = prefixOnly
      ? `SELECT id FROM companies INDEXED BY companies_name_idx WHERE normalized_name >= ? AND normalized_name < ?`
      : indexed
      ? `SELECT rowid AS id FROM company_search WHERE company_search MATCH ?`
      : `SELECT id FROM companies INDEXED BY companies_search_covering_idx
          WHERE normalized_name LIKE ? OR name LIKE ?
             OR (? != '' AND registration_number LIKE ?)`;
    const matchArguments = prefixOnly ? [prefix, prefixEnd] : indexed ? [indexMatch]
      : [normalizedQuery, `%${query.trim()}%`, registrationQuery, `%${registrationQuery}%`];
    const prefixes = regionPrefixes(options.region ?? "");
    const regionClause = prefixes.length ? `AND (${prefixes.map(() => "c.address LIKE ?").join(" OR ")})` : "";
    const order = options.sort === "employees" ? "s.employee_count DESC, s.snapshot_month DESC, c.name ASC, c.id ASC"
      : `CASE WHEN c.normalized_name = ? THEN 0 WHEN c.normalized_name LIKE ? THEN 1 ELSE 2 END,
          LENGTH(c.name) ASC, s.employee_count DESC, s.snapshot_month DESC, c.name ASC, c.id ASC`;
    const latestJoin = hasCompanyLatest(sqlite)
      ? "LEFT JOIN company_latest s ON s.company_id = c.id"
      : `LEFT JOIN company_snapshots s ON s.id = (
          SELECT s2.id FROM company_snapshots s2
          WHERE s2.company_id = c.id AND ${canonicalSnapshot}
          ORDER BY s2.snapshot_month DESC, s2.id DESC LIMIT 1
        )`;

    return sqlite
      .prepare(
        `
        WITH matches AS MATERIALIZED (
          ${matches}
        )
        SELECT
          c.id,
          c.name,
          c.industry,
          c.address,
          s.snapshot_month AS snapshotMonth,
          s.employee_count AS employeeCount,
          (${monthlySalary}) * 12 AS estimatedAverageAnnualSalary,
          s.new_joiners AS newJoiners,
          s.departures
        FROM matches matched JOIN companies c ON c.id = matched.id
        ${latestJoin}
        WHERE (? IS NULL OR s.employee_count >= ?) ${regionClause}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `
      )
      .all(...matchArguments, options.minEmployees ?? null, options.minEmployees ?? null,
        ...prefixes.map((value) => `${value}%`),
        ...(options.sort === "employees" ? [] : [prefix, `${prefix}%`]), limit, options.offset ?? 0) as CompanySearchResult[];
  });
}

export function getCompanyDetail(id: number) {
  return withDatabase((sqlite) => {
    return sqlite
      .prepare(
        `
        SELECT
          c.id,
          c.name,
          c.registration_number AS registrationNumber,
          c.industry,
          c.address,
          c.road_address AS roadAddress,
          c.lot_address AS lotAddress,
          s.snapshot_month AS snapshotMonth,
          s.employee_count AS employeeCount,
          s.monthly_billed_amount AS monthlyBilledAmount,
          (${monthlySalary}) AS estimatedAverageMonthlySalary,
          (${monthlySalary}) * 12 AS estimatedAverageAnnualSalary,
          s.new_joiners AS newJoiners,
          s.departures,
          sf.file_name AS sourceFileName,
          sf.imported_at AS sourceImportedAt
        FROM companies c
        LEFT JOIN company_snapshots s
          ON s.id = (
            SELECT s2.id
            FROM company_snapshots s2
            WHERE s2.company_id = c.id AND ${canonicalSnapshot}
            ORDER BY s2.snapshot_month DESC, s2.id DESC
            LIMIT 1
          )
        LEFT JOIN source_files sf ON sf.id = s.source_file_id
        WHERE c.id = ?
      `
      )
      .get(id) as CompanyDetail | undefined;
  });
}

export function getCompanyHistory(id: number, options: { from?: string; to?: string; limit?: number } = {}) {
  return withDatabase((sqlite) => {
    return sqlite
      .prepare(
        `
        SELECT
          snapshot_month AS snapshotMonth,
          employee_count AS employeeCount,
          (${monthlySalary}) * 12 AS estimatedAverageAnnualSalary,
          new_joiners AS newJoiners,
          departures
        FROM company_snapshots s
        WHERE company_id = ? AND (? IS NULL OR snapshot_month >= ?) AND (? IS NULL OR snapshot_month <= ?) AND s.id = (
          SELECT s2.id FROM company_snapshots s2
          WHERE s2.company_id = s.company_id AND s2.snapshot_month = s.snapshot_month
            AND ${canonicalSnapshot}
          ORDER BY s2.id DESC LIMIT 1
        )
        ORDER BY snapshot_month ASC LIMIT ?
      `
      )
      .all(id, options.from ?? null, options.from ?? null, options.to ?? null, options.to ?? null,
        options.limit ?? -1) as SnapshotHistory[];
  });
}

export function getStatisticsOverview() {
  return withDatabase((sqlite) => {
    const latest = sqlite.prepare(`SELECT snapshot_month AS snapshotMonth,
      active_workplace_count AS activeWorkplaceCount, subscriber_count AS subscriberCount,
      unknown_employee_count AS unknownEmployeeCount, industry_distribution AS industryDistribution,
      size_distribution AS sizeDistribution, generated_at AS generatedAt
      FROM monthly_statistics ORDER BY snapshot_month DESC LIMIT 1`).get() as {
        snapshotMonth: string; activeWorkplaceCount: number; subscriberCount: number;
        unknownEmployeeCount: number; industryDistribution: string; sizeDistribution: string; generatedAt: string;
      } | undefined;
    if (!latest) return undefined;
    const coverage = sqlite.prepare(`SELECT MIN(snapshot_month) AS firstMonth, MAX(snapshot_month) AS lastMonth,
      COUNT(*) AS monthCount FROM monthly_statistics`).get() as { firstMonth: string; lastMonth: string; monthCount: number };
    return { ...latest, ...coverage,
      industryDistribution: JSON.parse(latest.industryDistribution) as Distribution[],
      sizeDistribution: JSON.parse(latest.sizeDistribution) as Distribution[] };
  });
}
