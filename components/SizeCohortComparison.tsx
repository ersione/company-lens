import { GitCompareArrows } from "lucide-react";
import { sizeBands, type SizeCohortComparison as Comparison } from "@/lib/company-size-cohorts";
import { formatCurrency, formatNumber } from "@/lib/format";

export function SizeCohortComparison({ cohort, salary, growth, industry }: {
  cohort: Comparison | undefined; salary: number | null; growth: number | null; industry: string | null;
}) {
  return <section className="size-cohort" aria-labelledby="size-cohort-heading">
    <div className="insight-heading"><GitCompareArrows size={20} aria-hidden="true" /><h2 id="size-cohort-heading">같은 업종·비슷한 규모와 비교</h2></div>
    {!cohort ? <p className="caveat">최신 기준월의 동일 업종·가입자 규모 구간에 비교 가능한 사업장이 30곳 이상일 때 표시합니다.</p> : <>
      <p className="cohort-description">{industry} · 가입자 {sizeBands[cohort.sizeBand]} · {formatNumber(cohort.employeeSampleCount)}개 사업장</p>
      <div className="cohort-comparison-grid">
        <ComparisonMetric label="추정 평균 연봉" value={salary !== null && salary > 0 ? salary : null} median={cohort.medianAnnualSalary}
          count={cohort.salarySampleCount} money />
        <ComparisonMetric label="1년 가입자 증감률" value={growth} median={cohort.medianEmployeeChangePercent}
          count={cohort.growthSampleCount} />
      </div>
    </>}
    <p className="benchmark-note">가입자 규모 구간은 법적 기업 규모 구분이 아닙니다. 비교에 해당 사업장도 포함되며, 항목별 유효 표본 30곳 미만은 표시하지 않습니다. 급여는 국민연금 기반 추정치입니다. 고용 증감은 같은 식별키의 1년 전 자료가 있는 사업장만 비교합니다.</p>
  </section>;
}

function ComparisonMetric({ label, value, median, count, money = false }: {
  label: string; value: number | null; median: number | null; count: number; money?: boolean;
}) {
  const format = (number: number) => money ? formatCurrency(number) : `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
  const difference = value !== null && median !== null ? value - median : null;
  return <div className="cohort-metric"><h3>{label}</h3>
    <dl><div><dt>이 사업장</dt><dd>{value === null ? "비교 자료 없음" : format(value)}</dd></div>
      <div><dt>비교군 중간값</dt><dd>{median === null ? "비교 자료 부족" : format(median)}</dd></div></dl>
    {difference !== null && <p className="cohort-difference">{Math.abs(difference) < (money ? 1 : 0.05) ? "비교군 중간값과 같음"
      : `중간값보다 ${money ? formatCurrency(Math.abs(difference)) : `${Math.abs(difference).toFixed(1)}%p`} ${difference > 0 ? "높음" : "낮음"}`}</p>}
    <small>유효 표본 {formatNumber(count)}개 사업장</small>
  </div>;
}
