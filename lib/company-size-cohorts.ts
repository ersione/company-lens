import type Database from "better-sqlite3";
import { estimatedMonthlySalarySql } from "@/lib/pension";
import { monthOffset } from "@/lib/company-insights";

export const MIN_COHORT_SAMPLE = 30;
export const sizeBands = ["1~9명", "10~49명", "50~299명", "300~999명", "1,000명 이상"] as const;
export function sizeBandSql(column: string) {
  return `CASE WHEN ${column} < 10 THEN 0 WHEN ${column} < 50 THEN 1
    WHEN ${column} < 300 THEN 2 WHEN ${column} < 1000 THEN 3 ELSE 4 END`;
}

export function refreshSizeCohorts(sqlite: Database.Database, affectedMonth: string) {
  const latest = sqlite.prepare(`SELECT snapshot_month AS month, source_file_id AS sourceId
    FROM monthly_statistics ORDER BY snapshot_month DESC LIMIT 1`).get() as { month: string; sourceId: number } | undefined;
  if (!latest || ![latest.month, monthOffset(latest.month, -12)].includes(affectedMonth)) return;
  const previous = sqlite.prepare("SELECT source_file_id AS id FROM monthly_statistics WHERE snapshot_month = ?")
    .get(monthOffset(latest.month, -12)) as { id: number } | undefined;
  sqlite.transaction(() => {
    sqlite.exec("DELETE FROM company_size_cohorts");
    sqlite.prepare(`WITH eligible AS MATERIALIZED (
      SELECT s.industry, ${sizeBandSql("s.employee_count")} AS size_band,
        (${estimatedMonthlySalarySql("s")}) * 12 AS salary,
        CASE WHEN p.employee_count > 0 AND p.subscription_status_code = '1'
          THEN (s.employee_count - p.employee_count) * 100.0 / p.employee_count END AS growth
      FROM company_snapshots s LEFT JOIN company_snapshots p
        ON p.source_file_id = ? AND p.company_id = s.company_id AND p.snapshot_month = ?
      WHERE s.source_file_id = ? AND s.snapshot_month = ? AND s.subscription_status_code = '1'
        AND s.employee_count > 0 AND s.industry IS NOT NULL
        AND s.industry NOT IN ('업종 정보 없음', 'BIZ_NO미존재사업장', '해당없음', '복수 업종', '')
    ), totals AS (
      SELECT industry, size_band, COUNT(*) AS total FROM eligible GROUP BY industry, size_band
    ), salaries AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY industry, size_band ORDER BY salary) AS position,
        COUNT(*) OVER (PARTITION BY industry, size_band) AS total FROM eligible WHERE salary > 0
    ), growths AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY industry, size_band ORDER BY growth) AS position,
        COUNT(*) OVER (PARTITION BY industry, size_band) AS total FROM eligible WHERE growth IS NOT NULL
    ), salary_medians AS (
      SELECT industry, size_band, MAX(total) AS total, AVG(salary) AS median FROM salaries
      WHERE position IN ((total + 1) / 2, (total + 2) / 2) GROUP BY industry, size_band
    ), growth_medians AS (
      SELECT industry, size_band, MAX(total) AS total, AVG(growth) AS median FROM growths
      WHERE position IN ((total + 1) / 2, (total + 2) / 2) GROUP BY industry, size_band
    ) INSERT INTO company_size_cohorts
      SELECT t.industry, t.size_band, ?, ?, ?, t.total, COALESCE(s.total, 0), COALESCE(g.total, 0),
        CASE WHEN s.total >= ? THEN s.median END, CASE WHEN g.total >= ? THEN g.median END
      FROM totals t LEFT JOIN salary_medians s USING (industry, size_band)
        LEFT JOIN growth_medians g USING (industry, size_band) WHERE t.total >= ?`)
      .run(previous?.id ?? null, monthOffset(latest.month, -12), latest.sourceId, latest.month,
        latest.month, latest.sourceId, previous?.id ?? null, MIN_COHORT_SAMPLE, MIN_COHORT_SAMPLE, MIN_COHORT_SAMPLE);
  }).immediate();
}

export type SizeCohortComparison = {
  snapshotMonth: string; sizeBand: number; employeeSampleCount: number; salarySampleCount: number;
  growthSampleCount: number; medianAnnualSalary: number | null; medianEmployeeChangePercent: number | null;
};
