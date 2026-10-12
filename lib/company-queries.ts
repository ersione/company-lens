import { createDb } from "@/db/client";
import { findCompanyRecordCandidates } from "@/lib/company-record-candidates";
import { maxSearchCandidates, SearchTooBroadError } from "@/lib/company-search-guard";
import { migrate } from "@/db/migrate";
import type { Distribution } from "@/db/schema";
import { searchIndexMatch } from "@/lib/company-search-index";
import { shortSearchMatch, hasShortSearchIndex } from "@/lib/company-short-search";
import { estimatedMonthlySalarySql } from "@/lib/pension";
import type { CompanyBenchmark } from "@/lib/company-benchmarks";
import { defaultSearchOptions, regionPrefixes, type SearchOptions } from "@/lib/company-search-options";
import { companyRelevanceKey } from "@/lib/company-relevance";
import { canonicalSnapshotSql, hasCompanyLatest } from "@/lib/company-latest";
import { sizeBandSql, type SizeCohortComparison } from "@/lib/company-size-cohorts";

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

export function getCompanyRecordCandidates(id: number) {
  return withDatabase((sqlite) => findCompanyRecordCandidates(sqlite, id));
}

function withDatabase<T>(callback: (sqlite: ReturnType<typeof createDb>["sqlite"]) => T) {
  const client = createDb();
  try {
    migrate(client.sqlite);
    return callback(client.sqlite);
  } finally {
    client.sqlite.close();
  }
}

export type IndustryComparison = { snapshotMonth: string; employeeSampleCount: number; salarySampleCount: number;
  medianEmployeeCount: number; medianAnnualSalary: number | null };

export function getSizeCohortComparison(id: number) {
  return withDatabase((sqlite) => sqlite.prepare(`SELECT g.snapshot_month AS snapshotMonth, g.size_band AS sizeBand,
    g.employee_sample_count AS employeeSampleCount, g.salary_sample_count AS salarySampleCount,
    g.growth_sample_count AS growthSampleCount, g.median_annual_salary AS medianAnnualSalary,
    g.median_employee_change_percent AS medianEmployeeChangePercent
    FROM company_benchmarks b JOIN company_snapshots s ON s.company_id = b.company_id
      AND s.source_file_id = b.source_file_id AND s.snapshot_month = b.snapshot_month
    JOIN company_size_cohorts g ON g.industry = s.industry AND g.size_band = ${sizeBandSql("s.employee_count")}
      AND g.snapshot_month = b.snapshot_month AND g.source_file_id = b.source_file_id
    JOIN monthly_statistics m ON m.snapshot_month = g.snapshot_month AND m.source_file_id = g.source_file_id
    LEFT JOIN monthly_statistics p ON p.snapshot_month = strftime('%Y-%m', g.snapshot_month || '-01', '-12 months')
    WHERE b.company_id = ? AND g.previous_source_file_id IS p.source_file_id
      AND g.snapshot_month = (SELECT MAX(snapshot_month) FROM monthly_statistics)`)
    .get(id) as SizeCohortComparison | undefined);
}

export function getIndustryComparison(id: number) {
  return withDatabase((sqlite) => sqlite.prepare(`SELECT i.snapshot_month AS snapshotMonth,
    i.employee_sample_count AS employeeSampleCount, i.salary_sample_count AS salarySampleCount,
    i.median_employee_count AS medianEmployeeCount, i.median_annual_salary AS medianAnnualSalary
    FROM company_benchmarks b JOIN company_snapshots s ON s.company_id = b.company_id
      AND s.source_file_id = b.source_file_id AND s.snapshot_month = b.snapshot_month
    JOIN industry_statistics i ON i.industry = s.industry AND i.source_file_id = b.source_file_id
      AND i.snapshot_month = b.snapshot_month
    JOIN monthly_statistics m ON m.snapshot_month = b.snapshot_month AND m.source_file_id = b.source_file_id
    WHERE b.company_id = ?`).get(id) as IndustryComparison | undefined);
}

export function getCompanyNames(id: number) {
  return withDatabase((sqlite) => sqlite.prepare(`SELECT name, first_seen_month AS firstSeenMonth,
    last_seen_month AS lastSeenMonth FROM company_name_observations WHERE company_id = ?
    ORDER BY last_seen_month DESC, first_seen_month DESC, name LIMIT 30`).all(id) as {
      name: string; firstSeenMonth: string; lastSeenMonth: string;
    }[]);
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
  return withDatabase((sqlite) => sqlite.transaction(() => {
    const { results, totalCount } = query.trim()
      ? queryCompanies(sqlite, query, limit, { ...options, offset: (options.page - 1) * limit }, true)
      : { results: [], totalCount: 0 };
    const totalPages = Math.ceil(totalCount / limit);
    return { results, totalCount, totalPages, hasMore: options.page < totalPages };
  })());
}

export function searchCompanySuggestions(query: string, limit = 7) {
  try { return searchCompanies(query, limit); }
  catch (error) {
    if (error instanceof SearchTooBroadError) return [];
    throw error;
  }
}

export function searchCompanies(query: string, limit = 20, options: Partial<SearchOptions> & { offset?: number } = {}) {
  return withDatabase((sqlite) => queryCompanies(sqlite, query, limit, options).results);
}

function queryCompanies(sqlite: ReturnType<typeof createDb>["sqlite"], query: string, limit: number,
  options: Partial<SearchOptions> & { offset?: number }, countResults = false) {
    const sort = options.sort ?? defaultSearchOptions.sort;
    const normalizedQuery = `%${query.trim().toLocaleLowerCase("ko-KR")}%`;
    const registrationQuery = /^[\d\s-]+$/.test(query.trim()) ? query.replace(/\D/g, "") : "";
    const { cutoff, latestMonth } = sqlite.prepare(`SELECT month AS latestMonth,
      strftime('%Y-%m', month || '-01', '-12 months') AS cutoff FROM (SELECT COALESCE(
      (SELECT MAX(snapshot_month) FROM monthly_statistics),
      (SELECT MAX(snapshot_month) FROM source_files)) AS month)`)
      .get() as { cutoff: string | null; latestMonth: string | null };
    // Suppress zero-subscriber daily-worker records, not companies with a similar ordinary name.
    const markedName = "REPLACE(REPLACE(c.name, '（', '('), '）', ')')";
    const dailyWorker = `(${markedName} LIKE '%(일용)%' OR ${markedName} LIKE '%(일용직)%'
      OR c.name LIKE '%/일용/%' OR c.name LIKE '%-일용-%' OR c.name LIKE '%[일용]%')`;
    const visible = `(s.employee_count IS NOT 0 OR s.snapshot_month IS NULL OR s.snapshot_month > ? OR ? IS NULL)
      AND NOT (s.employee_count IS 0 AND ${dailyWorker})
      AND NOT (s.employee_count IS 0 AND NOT EXISTS (
        SELECT 1 FROM company_snapshots s2
        WHERE s2.company_id = c.id AND s2.snapshot_month < s.snapshot_month AND ${canonicalSnapshot}
      ))`;
    const joinType = !options.includeHistory && query.trim() ? "CROSS JOIN" : "LEFT JOIN";
    const latestJoin = hasCompanyLatest(sqlite)
      ? `${joinType} company_latest s ON s.company_id = c.id`
      : `${joinType} company_snapshots s ON s.id = (
          SELECT s2.id FROM company_snapshots s2
          WHERE s2.company_id = c.id AND ${canonicalSnapshot}
          ORDER BY s2.snapshot_month DESC, s2.id DESC LIMIT 1
        )`;
    if (!query.trim()) {
      const months = sqlite.prepare(`SELECT DISTINCT snapshot_month AS month
        FROM company_snapshots ORDER BY snapshot_month DESC`).all() as { month: string }[];
      // Limit name-ordered candidates before fetching their snapshot values.
      const selectPage = sqlite.prepare(
          `
          WITH candidates AS MATERIALIZED (
            SELECT c.id FROM companies c INDEXED BY companies_name_order_idx
            ${latestJoin}
            WHERE (SELECT s2.snapshot_month FROM company_snapshots s2
              WHERE s2.company_id = c.id AND ${canonicalSnapshot}
              ORDER BY s2.snapshot_month DESC, s2.id DESC LIMIT 1) IS ? AND ${visible}
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
        results.push(...selectPage.all(month, cutoff, cutoff, limit - results.length) as CompanySearchResult[]);
      }
      return { results, totalCount: results.length };
    }

    const indexMatch = searchIndexMatch(query, registrationQuery);
    const indexed = indexMatch !== undefined && sqlite.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'company_search'"
    ).get();
    const prefix = companyRelevanceKey(query);
    const shortMatch = shortSearchMatch(query, registrationQuery);
    const shortIndexed = shortMatch !== undefined && hasShortSearchIndex(sqlite);
    const rawMatches = indexed
      ? `SELECT rowid AS id FROM company_search WHERE company_search MATCH ?`
      : shortIndexed
      ? `SELECT f.rowid AS id FROM company_short_search f CROSS JOIN companies c ON c.id=f.rowid
          WHERE company_short_search MATCH ? AND (c.normalized_name LIKE ? OR c.name LIKE ?
            OR (? != '' AND c.registration_number LIKE ?))`
      : `SELECT id FROM companies INDEXED BY companies_search_covering_idx
          WHERE normalized_name LIKE ? OR name LIKE ?
             OR (? != '' AND registration_number LIKE ?)`;
    const matchArguments: (string | null | undefined)[] = indexed ? [indexMatch]
      : shortIndexed ? [shortMatch, normalizedQuery, `%${query.trim()}%`, registrationQuery, `%${registrationQuery}%`]
      : [normalizedQuery, `%${query.trim()}%`, registrationQuery, `%${registrationQuery}%`];
    // Bound discovery before materialization, random latest-row lookups and sorting.
    const { count } = sqlite.prepare(`SELECT COUNT(*) AS count FROM (${rawMatches} LIMIT ?)`)
      .get(...matchArguments, maxSearchCandidates + 1) as { count: number };
    if (count > maxSearchCandidates) throw new SearchTooBroadError();
    const prefixes = regionPrefixes(options.region ?? "");
    const regionClause = prefixes.length ? `AND (${prefixes.map(() => "c.address LIKE ?").join(" OR ")})` : "";
    if (sort === "relevance") sqlite.function("company_relevance_key", { deterministic: true },
      (name) => companyRelevanceKey(typeof name === "string" ? name : ""));
    const relevanceKey = "company_relevance_key(c.name)";
    const order = sort === "employees" ? "s.employee_count DESC, s.snapshot_month DESC, c.name ASC, c.id ASC"
      : `CASE WHEN ${relevanceKey} = ? THEN 0 WHEN ${relevanceKey} LIKE ? THEN 1 ELSE 2 END,
          LENGTH(${relevanceKey}) ASC, s.employee_count DESC, s.snapshot_month DESC, c.name ASC, c.id ASC`;

    // Candidate-first joins avoid a subscriber-index skip-scan across the entire latest month.
    const filtered = `FROM matches matched CROSS JOIN companies c ON c.id = matched.id
      ${latestJoin}
      WHERE ${options.includeHistory ? "" : "s.snapshot_month = ? AND "}${visible}
      AND (? IS NULL OR s.employee_count >= ?) ${regionClause}`;
    const filterArguments = [...matchArguments, ...(options.includeHistory ? [] : [latestMonth]), cutoff, cutoff, options.minEmployees ?? null,
      options.minEmployees ?? null, ...prefixes.map((value) => `${value}%`)];
    const totalCount = countResults
      ? (sqlite.prepare(`WITH matches AS MATERIALIZED (${rawMatches}) SELECT COUNT(*) AS count ${filtered}`)
          .get(...filterArguments) as { count: number }).count
      : null;
    if (totalCount === 0 || (totalCount !== null && (options.offset ?? 0) >= totalCount)) {
      return { results: [], totalCount: totalCount ?? 0 };
    }

    const results = sqlite
      .prepare(
        `
        WITH matches AS MATERIALIZED (${rawMatches})
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
        ${filtered}
        ORDER BY ${order}
        LIMIT ? OFFSET ?
      `
      )
      .all(...filterArguments,
        ...(sort === "employees" ? [] : [prefix, `${prefix}%`]), limit, options.offset ?? 0) as CompanySearchResult[];
    return { results, totalCount: totalCount ?? results.length };
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
