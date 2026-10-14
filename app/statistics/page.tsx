import Link from "next/link";
import { StatisticsChart } from "@/components/StatisticsChart";
import { StatisticsAnnual, StatisticsHeading, StatisticsHistory, StatisticsNotes, StatisticsSummary, StatisticsTable } from "@/components/StatisticsView";
import { getStatisticsGroups, getStatisticsHistory, getYearlyStatistics, isKnownStatisticsGroup } from "@/lib/public-statistics";
import { socialMetadata } from "@/lib/social-metadata";

export const dynamic = "force-dynamic";
export const metadata = socialMetadata("월간 고용 동향 | Company Lens", "국민연금 가입 사업장 수, 가입자 수와 추정 평균 급여의 월별 추이를 살펴봅니다.", "/statistics");

export default function StatisticsPage() {
  const history = getStatisticsHistory("total", "전국");
  return <main className="page-shell statistics-page">
    <StatisticsHeading title="월간 고용 동향" history={history} description="전국 가입 사업장의 고용 규모와 변화" />
    {history.length ? <><StatisticsSummary history={history} /><StatisticsChart history={history} />
      <section className="statistics-ranking"><div className="section-heading"><h2>고용 규모가 큰 업종</h2><Link href="/industries">업종 전체 보기 →</Link></div>
        <StatisticsTable rows={getStatisticsGroups("industry").filter(isKnownStatisticsGroup).slice(0, 8)} dimension="industry" total={history.at(-1)!.subscriberCount} />
        <p className="caveat statistics-footnote">미분류·복수 업종은 상위 업종에서 제외합니다. 전체 집계와 업종별 전체 목록에는 포함합니다.</p></section>
      <StatisticsHistory history={history} /><StatisticsAnnual rows={getYearlyStatistics("total", "전국")} /></> : <p className="empty-state">아직 생성된 통계가 없습니다.</p>}
    <StatisticsNotes />
  </main>;
}
