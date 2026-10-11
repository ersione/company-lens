import assert from "node:assert/strict";
import test from "node:test";
import { employmentInsight, employmentNarrative, monthOffset, parseComparisonIds, relatedNameQuery } from "@/lib/company-insights";
import type { SnapshotHistory } from "@/lib/company-queries";

const row = (snapshotMonth: string, employeeCount: number | null): SnapshotHistory => ({ snapshotMonth, employeeCount,
  estimatedAverageAnnualSalary: employeeCount === null ? null : employeeCount * 1000000, newJoiners: null, departures: null });

test("employment insights use exact year-ago months and contiguous non-null comparisons", () => {
  assert.equal(monthOffset("2026-01", -1), "2025-12");
  assert.equal(monthOffset("2026-08", -12), "2025-08");
  const history = [row("2025-08", 10), row("2026-06", 10), row("2026-07", 12), row("2026-08", 15)];
  const result = employmentInsight(history.reverse());
  assert.equal(result.employeeDelta, 5);
  assert.equal(result.employeeChangePercent, 50);
  assert.equal(result.annualSalaryChangePercent, 50);
  assert.equal(result.consecutiveMonths, 2);
  assert.equal(result.direction, "up");
  assert.equal(employmentInsight([row("2025-08", 0), row("2026-08", 10)]).employeeChangePercent, null);
  assert.equal(employmentInsight([row("2025-09", 10), row("2026-08", 10)]).employeeDelta, null);
  assert.equal(employmentInsight([row("2026-06", 10), row("2026-07", null), row("2026-08", 15)]).consecutiveMonths, 0);
  assert.equal(employmentInsight([row("2026-06", 10), row("2026-08", 15)]).direction, null);
  assert.equal(employmentInsight([row("2026-07", 10), row("2026-08", 10)]).direction, "flat");
  assert.equal(employmentInsight([row("2026-07", 10), row("2026-08", 8)]).direction, "down");
  assert.equal(employmentInsight([]).snapshotMonth, null);
  const longHistory = Array.from({ length: 20 }, (_, i) => row(monthOffset("2026-08", i - 19), i));
  assert.equal(employmentInsight(longHistory).consecutiveMonths, 12, "UI and API use the same bounded window");
});

test("comparison input is bounded and never silently deduplicates IDs", () => {
  assert.deepEqual(parseComparisonIds("1,2,3", 2).ids, [1, 2, 3]);
  for (const value of [undefined, "", "1", "1,1", "1,2,3,4", "0,2", "01,2", "1, 2", "9007199254740992,1", "abc,2"]) {
    assert.ok(parseComparisonIds(value, 2).error);
  }
  assert.deepEqual(parseComparisonIds("1").ids, [1]);
});

test("long-term summaries use exact endpoints and require complete movement windows", () => {
  const months = Array.from({ length: 13 }, (_, index) => ({ ...row(monthOffset("2026-08", index - 12), 20 + index),
    newJoiners: 2, departures: 1 }));
  const insight = employmentInsight([row("2023-08", 16), ...months].reverse());
  assert.equal(insight.threeYearEmployeeDelta, 16);
  assert.equal(insight.threeYearEmployeeChangePercent, 100);
  assert.equal(insight.twelveMonthNewJoiners, 24);
  assert.equal(insight.twelveMonthDepartures, 12);
  assert.equal(insight.movementMonths, 12);
  assert.match(employmentNarrative(insight), /최근 1년 가입자 60.0% 증가/);
  assert.match(employmentNarrative(insight), /최근 3개월 10.3% 증가/);
  const missing = employmentInsight(months.filter((item) => item.snapshotMonth !== "2026-07"));
  assert.equal(missing.twelveMonthNewJoiners, null);
  assert.equal(missing.recentThreeMonthChangePercent, null);
  const unknown = employmentInsight(months.map((item, i) => i === 5 ? { ...item, newJoiners: null } : item));
  assert.equal(unknown.twelveMonthNewJoiners, null);
  assert.equal(unknown.twelveMonthDepartures, 12);
  assert.equal(employmentInsight([row("2023-09", 10), row("2026-08", 20)]).threeYearEmployeeDelta, null);
  assert.equal(employmentInsight([row("2023-08", 0), row("2026-08", 20)]).threeYearEmployeeChangePercent, null);
});

test("related searches strip corporate forms without inferring any corporate relationship", () => {
  assert.equal(relatedNameQuery("유한회사 나이키코리아"), "나이키코리아");
  assert.equal(relatedNameQuery("삼성전자(주)"), "삼성전자");
  assert.equal(relatedNameQuery("(주)테스트회사 강남지점"), "테스트회사");
  assert.equal(relatedNameQuery("주식회사 에이"), null);
  assert.equal(relatedNameQuery("bad_name"), null);
});
