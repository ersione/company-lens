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

export function searchCompanies(query: string, limit = 20) {
  return withDatabase((sqlite) => {
    const normalizedQuery = `%${query.trim().toLocaleLowerCase("ko-KR")}%`;
    if (!query.trim()) {
      return sqlite
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
          ORDER BY s.snapshot_month DESC, c.name ASC
          LIMIT ?
        `
        )
        .all(limit) as CompanySearchResult[];
    }

    return sqlite
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
        WHERE c.normalized_name LIKE ?
           OR c.name LIKE ?
           OR c.registration_number LIKE ?
        ORDER BY
          CASE WHEN c.normalized_name = ? THEN 0 ELSE 1 END,
          s.snapshot_month DESC,
          c.name ASC
        LIMIT ?
      `
      )
      .all(normalizedQuery, `%${query.trim()}%`, `%${query.replace(/\D/g, "")}%`, query.trim().toLocaleLowerCase("ko-KR"), limit) as CompanySearchResult[];
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
          estimated_average_annual_salary AS estimatedAverageAnnualSalary,
          new_joiners AS newJoiners,
          departures
        FROM company_snapshots
        WHERE company_id = ?
        ORDER BY snapshot_month DESC, id DESC
        LIMIT 24
      `
      )
      .all(id) as SnapshotHistory[];
  });
}
