import { createDb } from "@/db/client";
import { migrate } from "@/db/migrate";

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

export type CompanySearchOptions = {
  limit?: number;
  page?: number;
  countOnly?: boolean;
  minEmployees?: number | null;
  region?: string | null;
  sort?: "relevance" | "employees";
};

export type CompanySearchResponse = {
  results: CompanySearchResult[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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
  estimatedAverageMonthlySalary: number | null;
  estimatedAverageAnnualSalary: number | null;
  newJoiners: number | null;
  departures: number | null;
};

const regionAddressPrefixes: Record<string, string[]> = {
  "서울특별시": ["서울특별시"],
  "부산광역시": ["부산광역시"],
  "대구광역시": ["대구광역시"],
  "인천광역시": ["인천광역시"],
  "광주광역시": ["광주광역시"],
  "대전광역시": ["대전광역시"],
  "울산광역시": ["울산광역시"],
  "세종특별자치시": ["세종특별자치시"],
  "경기도": ["경기도"],
  "강원특별자치도": ["강원특별자치도", "강원도"],
  "충청북도": ["충청북도"],
  "충청남도": ["충청남도"],
  "전북특별자치도": ["전북특별자치도", "전라북도"],
  "전라남도": ["전라남도"],
  "경상북도": ["경상북도"],
  "경상남도": ["경상남도"],
  "제주특별자치도": ["제주특별자치도"]
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

export function searchCompanies(query: string, options: CompanySearchOptions = {}): CompanySearchResponse {
  return withDatabase((sqlite) => {
    const trimmedQuery = query.trim();
    const pageSize = Math.max(1, Math.min(options.limit ?? 10, 100));
    const page = Math.max(1, options.page ?? 1);
    const offset = (page - 1) * pageSize;
    const minEmployees = options.minEmployees ?? null;
    const regionPrefixes = options.region ? (regionAddressPrefixes[options.region] ?? []) : [];
    const regionClause =
      regionPrefixes.length > 0
        ? `AND (${regionPrefixes.map(() => "c.address LIKE ?").join(" OR ")})`
        : "";
    const regionParams = regionPrefixes.map((prefix) => `${prefix}%`);
    const sort = options.sort ?? "relevance";
    const normalizedExactQuery = trimmedQuery.toLocaleLowerCase("ko-KR");
    const ftsQuery = normalizedExactQuery.replace(/"/g, "\"\"");
    const normalizedCorporateQuery = `${normalizedExactQuery}(%`;
    const normalizedPrefixQuery = `${normalizedExactQuery}%`;
    if (!query.trim()) {
      const results = sqlite
        .prepare(
          `
          SELECT
            c.id,
            c.name,
            c.industry,
            c.address,
            s.snapshot_month AS snapshotMonth,
            s.employee_count AS employeeCount,
            s.estimated_average_annual_salary AS estimatedAverageAnnualSalary,
            s.new_joiners AS newJoiners,
            s.departures
          FROM companies c
          LEFT JOIN company_snapshots s
            ON s.id = (
              SELECT s2.id
              FROM company_snapshots s2
              WHERE s2.company_id = c.id
              ORDER BY s2.snapshot_month DESC, s2.id DESC
              LIMIT 1
            )
          WHERE (? IS NULL OR s.employee_count >= ?)
            ${regionClause}
          ORDER BY s.snapshot_month DESC, c.name ASC
          LIMIT ?
        `
        )
        .all(minEmployees, minEmployees, ...regionParams, pageSize) as CompanySearchResult[];

      return {
        results,
        total: results.length,
        page: 1,
        pageSize,
        totalPages: 1
      };
    }

    const matchedCompaniesCte = `
      WITH matched_companies AS MATERIALIZED (
        SELECT
          c.id,
          c.name,
          c.industry,
          c.address,
          c.normalized_name
        FROM company_search_fts fts
        JOIN companies c ON c.id = fts.rowid
        WHERE company_search_fts MATCH ?
        ${regionClause}
      )
    `;
    const snapshotFilterClause = `
      WHERE (? IS NULL OR s.employee_count >= ?)
    `;
    const matchedParams = [ftsQuery, ...regionParams];
    const snapshotFilterParams = [minEmployees, minEmployees];
    const filteredCompaniesCte = `
      ${matchedCompaniesCte},
      filtered_companies AS MATERIALIZED (
        SELECT
          c.id,
          c.name,
          c.industry,
          c.address,
          c.normalized_name,
          s.snapshot_month AS snapshotMonth,
          s.employee_count AS employeeCount,
          s.estimated_average_annual_salary AS estimatedAverageAnnualSalary,
          s.new_joiners AS newJoiners,
          s.departures
        FROM matched_companies c
        LEFT JOIN company_snapshots s
          ON s.id = (
            SELECT s2.id
            FROM company_snapshots s2
            WHERE s2.company_id = c.id
            ORDER BY s2.snapshot_month DESC, s2.id DESC
            LIMIT 1
          )
        ${snapshotFilterClause}
      )
    `;

    if (options.countOnly) {
      const total = (
        sqlite
          .prepare(
            `
            ${filteredCompaniesCte}
            SELECT COUNT(*) AS total
            FROM filtered_companies
          `
          )
          .get(...matchedParams, ...snapshotFilterParams) as { total: number }
      ).total;

      return {
        results: [],
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize))
      };
    }

    const orderBy =
      sort === "employees"
        ? `
          ORDER BY
            CASE WHEN c.normalized_name = ? THEN 0 ELSE 1 END,
            c.employeeCount DESC,
            c.snapshotMonth DESC,
            c.name ASC
        `
        : `
          ORDER BY
            CASE WHEN c.normalized_name = ? THEN 0 ELSE 1 END,
            CASE WHEN c.normalized_name LIKE ? THEN 0 ELSE 1 END,
            CASE WHEN c.normalized_name LIKE ? THEN 0 ELSE 1 END,
            c.snapshotMonth DESC,
            c.name ASC
        `;

    type SearchResultRow = CompanySearchResult & { total: number };
    const rows = sqlite
      .prepare(
        `
        ${filteredCompaniesCte}
        SELECT
          c.id,
          c.name,
          c.industry,
          c.address,
          c.snapshotMonth,
          c.employeeCount,
          c.estimatedAverageAnnualSalary,
          c.newJoiners,
          c.departures,
          COUNT(*) OVER() AS total
        FROM filtered_companies c
        ${orderBy}
        LIMIT ?
        OFFSET ?
      `
      )
      .all(
        ...matchedParams,
        ...snapshotFilterParams,
        ...(sort === "employees"
          ? [normalizedExactQuery, pageSize, offset]
          : [normalizedExactQuery, normalizedCorporateQuery, normalizedPrefixQuery, pageSize, offset])
      ) as SearchResultRow[];
    const total = rows[0]?.total ?? 0;
    const results = rows.map(({ total: _total, ...row }) => row);

    return {
      results,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
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
          s.estimated_average_monthly_salary AS estimatedAverageMonthlySalary,
          s.estimated_average_annual_salary AS estimatedAverageAnnualSalary,
          s.new_joiners AS newJoiners,
          s.departures,
          sf.file_name AS sourceFileName,
          sf.imported_at AS sourceImportedAt
        FROM companies c
        LEFT JOIN company_snapshots s
          ON s.id = (
            SELECT s2.id
            FROM company_snapshots s2
            WHERE s2.company_id = c.id
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

export function getCompanyHistory(id: number) {
  return withDatabase((sqlite) => {
    return sqlite
      .prepare(
        `
        SELECT
          snapshot_month AS snapshotMonth,
          employee_count AS employeeCount,
          estimated_average_monthly_salary AS estimatedAverageMonthlySalary,
          estimated_average_annual_salary AS estimatedAverageAnnualSalary,
          new_joiners AS newJoiners,
          departures
        FROM company_snapshots
        WHERE company_id = ?
        ORDER BY snapshot_month DESC, id DESC
      `
      )
      .all(id) as SnapshotHistory[];
  });
}
