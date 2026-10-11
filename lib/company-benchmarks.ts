import type Database from "better-sqlite3";
import { estimatedMonthlySalarySql } from "@/lib/pension";
import { refreshSizeCohorts } from "@/lib/company-size-cohorts";

export const MIN_INDUSTRY_SAMPLE = 30;

// Only the newest canonical month is cached; older history remains in snapshots.
export function refreshCompanyBenchmarks(sqlite: Database.Database, month: string) {
  return sqlite.transaction(() => {
    const latest = sqlite.prepare(`SELECT snapshot_month AS month, source_file_id AS sourceId
      FROM monthly_statistics ORDER BY snapshot_month DESC LIMIT 1`).get() as { month: string; sourceId: number } | undefined;
    if (!latest || latest.month !== month) {
      refreshSizeCohorts(sqlite, month);
      return 0;
    }
    sqlite.exec("DELETE FROM company_benchmarks");
    const count = sqlite.prepare(`WITH eligible AS MATERIALIZED (
      SELECT s.company_id, s.employee_count, (${estimatedMonthlySalarySql("s")}) AS salary,
        CASE WHEN s.industry IS NULL OR s.industry IN ('업종 정보 없음', 'BIZ_NO미존재사업장', '해당없음', '복수 업종', '')
          THEN NULL ELSE s.industry END AS industry
      FROM company_snapshots s WHERE source_file_id = ? AND snapshot_month = ?
        AND subscription_status_code = '1' AND employee_count > 0
    ), employees AS (
      SELECT *, CUME_DIST() OVER (ORDER BY employee_count DESC) * 100 AS top,
        CUME_DIST() OVER (PARTITION BY industry ORDER BY employee_count DESC) * 100 AS industry_top,
        COUNT(*) OVER () AS total, COUNT(*) OVER (PARTITION BY industry) AS industry_total FROM eligible
    ), salaries AS (
      SELECT company_id, CUME_DIST() OVER (ORDER BY salary DESC) * 100 AS top,
        CUME_DIST() OVER (PARTITION BY industry ORDER BY salary DESC) * 100 AS industry_top,
        COUNT(*) OVER () AS total, COUNT(*) OVER (PARTITION BY industry) AS industry_total
      FROM eligible WHERE salary > 0
    ) INSERT INTO company_benchmarks SELECT e.company_id, ?, ?, e.top, s.top,
      CASE WHEN e.industry IS NOT NULL AND e.industry_total >= ? THEN e.industry_top END,
      CASE WHEN e.industry IS NOT NULL AND s.industry_total >= ? THEN s.industry_top END,
      e.total, COALESCE(s.total, (SELECT COUNT(*) FROM salaries)), e.industry_total, COALESCE(s.industry_total, 0)
      FROM employees e LEFT JOIN salaries s ON s.company_id = e.company_id`)
      .run(latest.sourceId, month, month, latest.sourceId, MIN_INDUSTRY_SAMPLE, MIN_INDUSTRY_SAMPLE).changes;
    sqlite.exec("DELETE FROM industry_statistics");
    sqlite.prepare(`WITH eligible AS MATERIALIZED (
      SELECT industry, employee_count, (${estimatedMonthlySalarySql("s")}) * 12 AS salary
      FROM company_snapshots s WHERE source_file_id = ? AND snapshot_month = ?
        AND subscription_status_code = '1' AND employee_count > 0
        AND industry IS NOT NULL AND industry NOT IN ('업종 정보 없음', 'BIZ_NO미존재사업장', '해당없음', '복수 업종', '')
    ), employees AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY industry ORDER BY employee_count) AS position,
        COUNT(*) OVER (PARTITION BY industry) AS total FROM eligible
    ), salaries AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY industry ORDER BY salary) AS position,
        COUNT(*) OVER (PARTITION BY industry) AS total FROM eligible WHERE salary > 0
    ), employee_medians AS (
      SELECT industry, MAX(total) AS total, AVG(employee_count) AS median FROM employees
      WHERE position IN ((total + 1) / 2, (total + 2) / 2) GROUP BY industry
    ), salary_medians AS (
      SELECT industry, MAX(total) AS total, AVG(salary) AS median FROM salaries
      WHERE position IN ((total + 1) / 2, (total + 2) / 2) GROUP BY industry
    ) INSERT INTO industry_statistics
      SELECT e.industry, ?, ?, e.total, COALESCE(s.total, 0), e.median,
        CASE WHEN s.total >= ? THEN s.median END
      FROM employee_medians e LEFT JOIN salary_medians s ON s.industry = e.industry WHERE e.total >= ?`)
      .run(latest.sourceId, month, month, latest.sourceId, MIN_INDUSTRY_SAMPLE, MIN_INDUSTRY_SAMPLE);
    refreshSizeCohorts(sqlite, month);
    return count;
  }).immediate();
}

export type CompanyBenchmark = {
  employeeTopPercent: number; salaryTopPercent: number | null;
  industryEmployeeTopPercent: number | null; industrySalaryTopPercent: number | null;
  employeeSampleCount: number; salarySampleCount: number;
  industryEmployeeSampleCount: number; industrySalarySampleCount: number;
};
