import Link from "next/link";
import { ArrowUpRight, Building2, Users, Wallet, Activity, CalendarDays, MapPin, Layers3 } from "lucide-react";
import { StatisticsChart } from "@/components/StatisticsChart";
import { formatCurrency, formatNumber, formatSnapshotMonth } from "@/lib/format";
import { getYearlyStatistics, isKnownStatisticsGroup, statisticsChange, statisticsHref, type StatisticsRow, type YearlyStatisticsRow } from "@/lib/public-statistics";

export function StatisticsTabs({ active }: { active: "total" | "industry" | "region" | "changes" }) {
  return <nav className="statistics-tabs" aria-label="공개 통계">
    <Link href="/statistics" aria-current={active === "total" ? "page" : undefined}><Activity size={17} />월간 고용 동향</Link>
    <Link href="/employment-trends" aria-current={active === "changes" ? "page" : undefined}><Users size={17} />고용 변화</Link>
    <Link href="/industries" aria-current={active === "industry" ? "page" : undefined}><Layers3 size={17} />업종별 현황</Link>
    <Link href="/regions" aria-current={active === "region" ? "page" : undefined}><MapPin size={17} />지역별 현황</Link>
  </nav>;
}

function signed(value: number) { return `${value > 0 ? "+" : ""}${formatNumber(value)}`; }

export function StatisticsSummary({ history }: { history: StatisticsRow[] }) {
  const latest = history.at(-1)!;
  const monthly = statisticsChange(history, 1);
  const yearly = statisticsChange(history, 12);
  return <div className="statistics-summary">
    <div><span><Users size={18} />국민연금 가입자</span><strong>{formatNumber(latest.subscriberCount)}<small>명</small></strong>
      <p>전월 대비 <b>{monthly ? `${signed(monthly.count)}명` : "비교 자료 없음"}</b></p></div>
    <div><span><Building2 size={18} />가입 사업장</span><strong>{formatNumber(latest.workplaceCount)}<small>개</small></strong>
      <p>가입 상태 코드 1 기준</p></div>
    <div><span><Wallet size={18} />추정 평균 연봉</span><strong>{formatCurrency(latest.annualSalary)}</strong>
      <p>국민연금 기반 추정치 · 가입자 가중평균</p></div>
    <div><span><Activity size={18} />전년 동월 고용 증감</span><strong className={yearly && yearly.count < 0 ? "negative" : ""}>
      {yearly?.percent !== null && yearly?.percent !== undefined ? `${yearly.percent > 0 ? "+" : ""}${yearly.percent.toFixed(1)}%` : "비교 불가"}</strong>
      <p>{yearly ? `${signed(yearly.count)}명 · 12개월 전 대비` : "전년 동월 자료 없음"}</p></div>
  </div>;
}

export function StatisticsTable({ rows, dimension, total }: { rows: StatisticsRow[]; dimension: "industry" | "region"; total: number }) {
  return <div className="statistics-table-scroll"><table className="statistics-table">
    <thead><tr><th>{dimension === "industry" ? "업종" : "지역"}</th><th>가입자 수</th><th>사업장 수</th><th>추정 평균 연봉</th><th>가입자 비중</th></tr></thead>
    <tbody>{rows.map((row) => <tr key={row.key}><th scope="row"><Link href={statisticsHref(dimension, row.key)} prefetch={false}>
      {row.key}<ArrowUpRight size={15} aria-hidden="true" /></Link></th>
      <td>{formatNumber(row.subscriberCount)}명</td><td>{formatNumber(row.workplaceCount)}개</td><td>{formatCurrency(row.annualSalary)}</td>
      <td><span className="statistics-share"><span style={{ width: `${total ? Math.min(100, row.subscriberCount / total * 100) : 0}%` }} /></span>
        {total ? (row.subscriberCount / total * 100).toFixed(1) : "0.0"}%</td></tr>)}</tbody>
  </table></div>;
}

export function StatisticsDistribution({ rows, dimension, total }: { rows: StatisticsRow[]; dimension: "industry" | "region"; total: number }) {
  const ranked = rows.filter(isKnownStatisticsGroup);
  const unclassified = rows.filter((row) => !isKnownStatisticsGroup(row)).reduce((sum, row) => sum + row.subscriberCount, 0);
  const max = Math.max(1, ...ranked.map((row) => row.subscriberCount));
  return <section className="statistics-distribution"><div className="section-heading"><h2>가입자 분포</h2><span>가입자 수 상위 8개 · 비율은 전국 대비</span></div>
    <div className="statistics-bars">{ranked.slice(0, 8).map((row, index) => <Link href={statisticsHref(dimension, row.key)} key={row.key} prefetch={false}>
      <div className="statistics-bar-label"><span><b>{String(index + 1).padStart(2, "0")}</b>{row.key}</span>
        <strong>{formatNumber(row.subscriberCount)}<small>명</small></strong></div>
      <div className="statistics-bar-track"><span style={{ width: `${row.subscriberCount / max * 100}%` }} /></div>
      <small className="statistics-bar-percent">전국의 {total ? (row.subscriberCount / total * 100).toFixed(1) : "0.0"}%</small>
    </Link>)}</div>
    {unclassified > 0 && <p className="caveat statistics-footnote">미분류·복수 분류 가입자 {formatNumber(unclassified)}명
      {total > 0 && ` (${(unclassified / total * 100).toFixed(1)}%)`}은 상위 분포에서 제외하며 아래 전체 목록에 포함합니다.</p>}
  </section>;
}

export function StatisticsNotes({ region = false }: { region?: boolean }) {
  return <aside className="statistics-notes"><h2>집계 기준</h2>
    <p>출처: 국민연금공단 공개 사업장 자료. 가입 상태 코드 1인 사업장을 집계하며, 명시적 일용 사업장은 제외합니다.
      사업장 수는 법인 수가 아니며 가입자 수는 전체 근로자 수와 다릅니다. 사업장별 합계이며 개인 간 중복을 제거한 수치가 아닙니다.</p>
    <p>급여는 국민연금 기반 추정치입니다. 유효한 가입자 수와 고지금액이 있는 사업장의 금액을 합산해 해당 연도 보험료율과 가입자 수로 나눈 가중평균으로, 실제 급여와 다를 수 있습니다.</p>
    <p>증감은 각 월의 집계값 차이이며 동일 사업장만 추적한 값이 아닙니다. 신규취득·자격상실은 실제 입·퇴사와 다를 수 있고, 원본의 누락값은 합계에서 제외됩니다. 자료가 없는 월은 차트를 연결하지 않습니다. 원본의 제공 범위·분류 변경에 따라 시계열에 단절이 있을 수 있습니다.</p>
    {region && <p className="statistics-region-note">지역은 집계 생성 시 보관된 사업장 주소를 기준으로 분류합니다. 과거 시점의 소재지나 지역 간 이동을 나타내지 않으며, 주소 변경 후 과거 집계를 다시 생성하면 지역별 수치가 달라질 수 있습니다. 강원·전북의 행정구역 명칭은 현재 명칭으로 통합했습니다.</p>}
  </aside>;
}

export function StatisticsHistory({ history }: { history: StatisticsRow[] }) {
  return <section className="statistics-history"><div className="section-heading"><h2>최근 12개 자료월</h2><span>국민연금 가입 사업장 기준</span></div>
    <div className="statistics-table-scroll"><table className="statistics-table"><thead><tr>
      <th>자료월</th><th>가입자 수</th><th>사업장 수</th><th>신규취득</th><th>자격상실</th><th>추정 평균 연봉</th>
    </tr></thead><tbody>{history.slice(-12).reverse().map((row) => <tr key={row.month}>
      <th scope="row">{formatSnapshotMonth(row.month)}</th><td>{formatNumber(row.subscriberCount)}명</td>
      <td>{formatNumber(row.workplaceCount)}개</td><td>{formatNumber(row.newJoiners)}명</td>
      <td>{formatNumber(row.departures)}명</td><td>{formatCurrency(row.annualSalary)}</td></tr>)}</tbody></table></div>
  </section>;
}

export function StatisticsAnnual({ rows }: { rows: YearlyStatisticsRow[] }) {
  if (!rows.length) return null;
  return <section className="statistics-history"><div className="section-heading"><h2>연간 고용 요약</h2><span>인원은 연평균 · 취득·상실은 누적</span></div>
    <div className="statistics-table-scroll"><table className="statistics-table"><thead><tr>
      <th>연도 · 집계 기간</th><th>연평균 가입자</th><th>마지막 월 가입자</th><th>연간 신규취득</th><th>연간 자격상실</th><th>추정 평균 연봉</th>
    </tr></thead><tbody>{rows.map((row) => <tr key={row.year}><th scope="row">{row.year}년
      <small className="statistics-year-coverage">{Number(row.firstMonth.slice(5))}~{Number(row.lastMonth.slice(5))}월 · {row.monthCount}개월{row.monthCount < 12 ? " · 부분 집계" : ""}</small></th>
      <td>{formatNumber(Math.round(row.averageSubscriberCount))}명</td><td>{formatNumber(row.endSubscriberCount)}명</td>
      <td>{formatNumber(row.newJoiners)}명</td><td>{formatNumber(row.departures)}명</td><td>{formatCurrency(row.annualSalary)}</td></tr>)}</tbody></table></div>
    <p className="caveat">연평균은 자료가 있는 월을 기준으로 계산합니다. 신규취득·자격상실은 중복 인원을 포함할 수 있으며 고유 인원 수가 아닙니다. 부분 집계 연도끼리의 누적값 비교에 주의하세요.</p>
  </section>;
}

export function StatisticsDetail({ history, title, dimension }: {
  history: StatisticsRow[]; title: string; dimension: "industry" | "region";
}) {
  return <main className="page-shell statistics-page"><StatisticsTabs active={dimension} />
    <Link className="statistics-back" href={statisticsHref(dimension)}>← {dimension === "industry" ? "업종" : "지역"} 전체 현황</Link>
    <StatisticsHeading title={title} history={history} description={dimension === "industry" ? "업종별 고용 규모와 급여의 변화" : "지역별 가입 사업장과 고용의 변화"} />
    <StatisticsSummary history={history} /><StatisticsChart history={history} />
    <StatisticsHistory history={history} /><StatisticsAnnual rows={getYearlyStatistics(dimension, history.at(-1)!.key)} /><StatisticsNotes region={dimension === "region"} />
  </main>;
}

export function StatisticsHeading({ title, history, description }: { title: string; history: StatisticsRow[]; description: string }) {
  return <header className="statistics-heading"><div><p className="eyebrow">EMPLOYMENT OBSERVATORY</p><h1>{title}</h1><p>{description}</p></div>
    {history.length > 0 && <span className="statistics-date"><CalendarDays size={17} />{formatSnapshotMonth(history.at(-1)!.month)} 기준</span>}
  </header>;
}
