import type Database from "better-sqlite3";
import type { Distribution } from "@/db/schema";
import { refreshCompanyBenchmarks } from "@/lib/company-benchmarks";
import { refreshCompanyLatest } from "@/lib/company-latest";

export function refreshMonthlyStatistics(sqlite: Database.Database, month: string, options: { refreshDerived?: boolean } = {}) {
  const source = sqlite.prepare(`SELECT id FROM source_files WHERE snapshot_month = ?
    ORDER BY COALESCE(published_at, '') DESC, id DESC LIMIT 1`).get(month) as { id: number } | undefined;
  if (!source) return;
  const totals = sqlite.prepare(`SELECT COUNT(*) AS workplaceCount,
    COALESCE(SUM(CASE WHEN subscription_status_code = '1' THEN 1 ELSE 0 END), 0) AS activeWorkplaceCount,
    COALESCE(SUM(CASE WHEN subscription_status_code = '1' THEN employee_count END), 0) AS subscriberCount,
    COALESCE(SUM(CASE WHEN subscription_status_code = '1' AND employee_count IS NULL THEN 1 ELSE 0 END), 0) AS unknownEmployeeCount,
    COALESCE(SUM(CASE WHEN subscription_status_code = '1' THEN new_joiners END), 0) AS newJoiners,
    COALESCE(SUM(CASE WHEN subscription_status_code = '1' THEN departures END), 0) AS departures
    FROM company_snapshots WHERE source_file_id = ?`).get(source.id) as Record<string, number>;
  const distribution = (expression: string) => sqlite.prepare(`SELECT ${expression} AS label,
    COUNT(*) AS workplaceCount, COALESCE(SUM(employee_count), 0) AS subscriberCount
    FROM company_snapshots WHERE source_file_id = ? AND subscription_status_code = '1'
    GROUP BY label ORDER BY workplaceCount DESC, label ASC`).all(source.id) as Distribution[];
  const industries = distribution("COALESCE(industry, '업종 정보 없음')");
  const sizes = distribution(`CASE WHEN employee_count IS NULL THEN '인원 미상'
    WHEN employee_count < 10 THEN '10명 미만' WHEN employee_count < 50 THEN '10~49명'
    WHEN employee_count < 300 THEN '50~299명' ELSE '300명 이상' END`);
  sqlite.prepare(`INSERT INTO monthly_statistics (snapshot_month, source_file_id, workplace_count,
    active_workplace_count, subscriber_count, unknown_employee_count, new_joiners, departures,
    industry_distribution, size_distribution, generated_at)
    VALUES (@month, @sourceId, @workplaceCount, @activeWorkplaceCount, @subscriberCount,
      @unknownEmployeeCount, @newJoiners, @departures, @industries, @sizes, @now)
    ON CONFLICT(snapshot_month) DO UPDATE SET source_file_id = excluded.source_file_id,
      workplace_count = excluded.workplace_count, active_workplace_count = excluded.active_workplace_count,
      subscriber_count = excluded.subscriber_count, unknown_employee_count = excluded.unknown_employee_count,
      new_joiners = excluded.new_joiners, departures = excluded.departures,
      industry_distribution = excluded.industry_distribution, size_distribution = excluded.size_distribution,
      generated_at = excluded.generated_at`).run({ ...totals, month, sourceId: source.id,
        industries: JSON.stringify(industries), sizes: JSON.stringify(sizes), now: new Date().toISOString() });
  if (options.refreshDerived !== false) {
    refreshCompanyBenchmarks(sqlite, month);
    refreshCompanyLatest(sqlite, month);
  }
}

export function rebuildMonthlyStatistics(sqlite: Database.Database) {
  const months = sqlite.prepare("SELECT DISTINCT snapshot_month AS month FROM source_files ORDER BY snapshot_month").all() as { month: string }[];
  sqlite.transaction(() => {
    for (const { month } of months) refreshMonthlyStatistics(sqlite, month);
  }).immediate();
  return months.length;
}
