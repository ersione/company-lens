import { StatisticsGroupSelect } from "@/components/StatisticsGroupSelect";
import { StatisticsDistribution, StatisticsHeading, StatisticsNotes, StatisticsTable } from "@/components/StatisticsView";
import { getStatisticsGroups, getStatisticsHistory, statisticsHref } from "@/lib/public-statistics";
import { formatNumber } from "@/lib/format";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { searchPageNumbers } from "@/lib/company-search-options";

export function StatisticsGroupsPage({ dimension, requestedPage = "1" }: { dimension: "industry" | "region"; requestedPage?: string | string[] }) {
  const groups = getStatisticsGroups(dimension);
  const history = getStatisticsHistory("total", "전국");
  const industry = dimension === "industry";
  const totalPages = Math.max(1, Math.ceil(groups.length / 30));
  const page = typeof requestedPage === "string" && /^[1-9]\d{0,5}$/.test(requestedPage) ? Math.min(Number(requestedPage), totalPages) : 1;
  const href = (value: number) => `${statisticsHref(dimension)}${value > 1 ? `?page=${value}` : ""}`;
  return <main className="page-shell statistics-page">
    <StatisticsHeading title={industry ? "업종별 현황" : "지역별 현황"} history={history}
      description={industry ? "업종별 고용 분포와 월별 변화" : "전국 시·도의 고용 분포와 월별 변화"} />
    {groups.length ? <>{page === 1 && <StatisticsDistribution rows={groups} dimension={dimension} total={history.at(-1)?.subscriberCount ?? 0} />}
      <div className="statistics-directory-heading"><p><strong>{formatNumber(groups.length)}</strong>개 {industry ? "업종" : "지역"} · 가입자 수순</p>
      <StatisticsGroupSelect groups={groups.map((row) => row.key).sort((a, b) => a.localeCompare(b, "ko"))} path={statisticsHref(dimension)} /></div>
      <StatisticsTable rows={groups.slice((page - 1) * 30, page * 30)} dimension={dimension} total={history.at(-1)?.subscriberCount ?? 0} />
      {totalPages > 1 && <nav className="search-pagination" aria-label="업종 현황 페이지">
        {page > 1 ? <Link className="page-previous" href={href(page - 1)} prefetch={false}><ChevronLeft size={18} />이전</Link>
          : <span className="page-previous" aria-disabled="true"><ChevronLeft size={18} />이전</span>}
        <div className="page-numbers">{searchPageNumbers(page, totalPages).map((value, i) => value === "ellipsis"
          ? <span key={`gap-${i}`} className="page-ellipsis">...</span>
          : value === page ? <strong key={value} aria-current="page" aria-label={`${value}페이지`}>{value}</strong>
          : <Link href={href(value)} prefetch={false} key={value} aria-label={`${value}페이지`}>{value}</Link>)}</div>
        {page < totalPages ? <Link className="page-next" href={href(page + 1)} prefetch={false}>다음<ChevronRight size={18} /></Link>
          : <span className="page-next" aria-disabled="true">다음<ChevronRight size={18} /></span>}
      </nav>}</>
      : <p className="empty-state">아직 생성된 통계가 없습니다.</p>}
    <StatisticsNotes region={!industry} />
  </main>;
}
