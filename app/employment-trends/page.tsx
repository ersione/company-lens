import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CalendarDays, TrendingDown, TrendingUp, Users } from "lucide-react";
import { StatisticsNotes, StatisticsTabs } from "@/components/StatisticsView";
import { employmentRateMinimum, getIndustryEmploymentChanges, rankEmploymentChanges, statisticsHref, type EmploymentChangeOptions } from "@/lib/public-statistics";
import { formatNumber, formatSnapshotMonth } from "@/lib/format";
import { socialMetadata } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";
export const metadata = socialMetadata("업종별 고용 변화 | Company Lens", "최근 1개월·3개월·1년간 국민연금 가입자가 늘거나 줄어든 업종을 비교합니다.", "/employment-trends");

const signed = (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value)}`;

export default async function EmploymentTrendsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const options: EmploymentChangeOptions = {
    months: params.period === "3" ? 3 : params.period === "1" ? 1 : 12,
    direction: params.direction === "decrease" ? "decrease" : "increase",
    sort: params.sort === "rate" ? "rate" : "count"
  };
  const data = getIndustryEmploymentChanges(options.months);
  const ranked = rankEmploymentChanges(data.rows, options);
  const increases = rankEmploymentChanges(data.rows, { ...options, direction: "increase", sort: "count" });
  const decreases = rankEmploymentChanges(data.rows, { ...options, direction: "decrease", sort: "count" });
  const href = (change: Partial<EmploymentChangeOptions>) => {
    const next = { ...options, ...change };
    return `/employment-trends?${new URLSearchParams({ period: String(next.months), direction: next.direction, sort: next.sort })}`;
  };
  const declining = options.direction === "decrease";
  const label = declining ? "감소" : "증가";
  const period = options.months === 12 ? "1년 전" : options.months === 3 ? "3개월 전" : "전월";
  const maximum = Math.max(1, ...ranked.map((row) => Math.abs(options.sort === "rate" ? row.percent! : row.change)));
  return <main className={`page-shell statistics-page employment-trends${declining ? " employment-declining" : ""}`}>
    <StatisticsTabs active="changes" />
    <header className="statistics-heading"><div><p className="eyebrow">EMPLOYMENT MOVEMENT</p><h1>업종별 고용 변화</h1>
      <p>어떤 업종에서 국민연금 가입자가 늘고 줄었을까요?</p></div>
      {data.month && <span className="statistics-date"><CalendarDays size={17} />{formatSnapshotMonth(data.month)} 기준</span>}
    </header>
    <div className="employment-controls">
      <nav className="employment-segments" aria-label="비교 기간">{([12, 3, 1] as const).map((months) =>
        <Link key={months} href={href({ months })} scroll={false} aria-current={options.months === months ? "page" : undefined}>
          {months === 12 ? "1년 전 대비" : months === 3 ? "최근 3개월" : "전월 대비"}</Link>)}</nav>
      <nav className="employment-segments employment-direction" aria-label="고용 변화 방향">
        <Link href={href({ direction: "increase" })} scroll={false} aria-current={!declining ? "page" : undefined}><TrendingUp size={17} />증가 업종</Link>
        <Link href={href({ direction: "decrease" })} scroll={false} aria-current={declining ? "page" : undefined}><TrendingDown size={17} />감소 업종</Link>
      </nav>
    </div>
    {data.month && data.hasBaseline ? <>
      <section className="employment-overview" aria-label="업종 고용 변화 요약">
        <div><span><TrendingUp size={17} />가입자 증가 업종</span><strong>{formatNumber(increases.length)}<small>개</small></strong><p>{period} 대비</p></div>
        <div><span><TrendingDown size={17} />가입자 감소 업종</span><strong>{formatNumber(decreases.length)}<small>개</small></strong><p>양쪽 월에 자료가 있는 업종</p></div>
        <div><span><Users size={17} />가장 많이 {label}한 업종</span><strong>{signed((declining ? decreases : increases)[0]?.change ?? 0)}<small>명</small></strong>
          <p>{(declining ? decreases : increases)[0]?.key ?? "해당 업종 없음"}</p></div>
      </section>
      <section className="statistics-ranking">
        <div className="employment-ranking-heading"><div><h2>가입자가 {declining ? "줄어든" : "늘어난"} 업종</h2>
          <p>{formatSnapshotMonth(data.previousMonth!)} → {formatSnapshotMonth(data.month)} · {formatNumber(ranked.length)}개 업종 중 상위 50개</p></div>
          <nav className="employment-segments" aria-label="고용 변화 정렬">
            <Link href={href({ sort: "count" })} scroll={false} aria-current={options.sort === "count" ? "page" : undefined}>{label} 인원순</Link>
            <Link href={href({ sort: "rate" })} scroll={false} aria-current={options.sort === "rate" ? "page" : undefined}>{label}율순</Link>
          </nav>
        </div>
        {ranked.length ? <div className="statistics-table-scroll"><table className="statistics-table employment-ranking">
          <thead><tr><th scope="col">업종</th><th scope="col">{label} 인원</th><th scope="col">{label}율</th><th scope="col">현재 가입자</th><th scope="col">비교월 가입자</th></tr></thead>
          <tbody>{ranked.slice(0, 50).map((row, index) => <tr key={row.key} data-change={row.change} data-percent={row.percent ?? ""}>
            <th scope="row"><Link href={statisticsHref("industry", row.key)} prefetch={false}><span className="employment-rank">{String(index + 1).padStart(2, "0")}</span>
              {row.key}<ArrowUpRight size={15} aria-hidden="true" /></Link></th>
            <td><strong className="employment-change">{declining ? <ArrowDownRight size={15} /> : <ArrowUpRight size={15} />}{signed(row.change)}명</strong>
              <span className="employment-change-track"><span style={{ width: `${Math.abs(options.sort === "rate" ? row.percent! : row.change) / maximum * 100}%` }} /></span></td>
            <td className="employment-change">{row.percent === null ? "산출 불가" : `${row.percent > 0 ? "+" : ""}${row.percent.toFixed(1)}%`}</td>
            <td>{formatNumber(row.subscriberCount)}명</td><td>{formatNumber(row.previousCount)}명</td>
          </tr>)}</tbody></table></div> : <p className="empty-state">선택한 조건에 해당하는 업종이 없습니다.</p>}
        <p className="caveat statistics-footnote">{options.sort === "rate" && `비율 비교는 양쪽 월 가입자 ${formatNumber(employmentRateMinimum)}명 이상 업종만 포함합니다. `}
          미분류·복수 업종 및 비교월 자료가 없는 업종은 제외합니다.</p>
      </section>
    </> : <p className="empty-state">{data.month ? `${period} 자료가 없어 비교할 수 없습니다.` : "아직 생성된 통계가 없습니다."}</p>}
    <aside className="employment-context"><TrendingUp size={20} aria-hidden="true" /><p>
      {options.months === 3 ? "최근 3개월은 최신 자료와 3개월 전 자료의 가입자 수 차이입니다. 월별 증감의 평균이나 3개월 연속 증가를 뜻하지 않습니다. " : ""}
      업종별 가입자 변화이며, 특정 직업의 인기나 채용 공고 수를 나타내지 않습니다. 계절 효과를 줄이려면 1년 전 대비를 함께 확인하세요.</p></aside>
    <StatisticsNotes />
  </main>;
}
