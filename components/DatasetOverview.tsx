import { Metric, MetricPanel } from "@ersione/design-system/react";
import type { getStatisticsOverview } from "@/lib/company-queries";
import { formatNumber, formatSnapshotMonth } from "@/lib/format";
import { Building2, UsersRound, History, ChartNoAxesCombined, Layers3 } from "lucide-react";

export function DatasetOverview({ statistics }: { statistics: NonNullable<ReturnType<typeof getStatisticsOverview>> }) {
  const sizes = ["10명 미만", "10~49명", "50~299명", "300명 이상", "인원 미상"]
    .map((label) => statistics.sizeDistribution.find((row) => row.label === label)).filter((row) => row !== undefined);
  const industries = statistics.industryDistribution.filter((row) =>
    !["업종 정보 없음", "BIZ_NO미존재사업장", "해당없음", "복수 업종"].includes(row.label));
  return <section className="dataset-overview" aria-label="공개 데이터 통계">
    <div className="section-heading"><h2>공개 데이터 현황</h2><span>{formatSnapshotMonth(statistics.snapshotMonth)} 기준</span></div>
    <MetricPanel className="dataset-metrics">
      <Metric label={<><Building2 size={16} aria-hidden="true" />등록 사업장</>}
        value={formatNumber(statistics.activeWorkplaceCount)} unit="곳" tone="people" description="현재 가입 상태인 사업장" />
      <Metric label={<><UsersRound size={16} aria-hidden="true" />가입자 수 합계</>}
        value={formatNumber(statistics.subscriberCount)} unit="건" tone="people" description="사업장별 가입 건수 기준" />
      <Metric label={<><History size={16} aria-hidden="true" />축적된 월별 자료</>}
        value={statistics.monthCount} unit="개월" tone="flow" description={`${statistics.firstMonth} ~ ${statistics.lastMonth}`} />
    </MetricPanel>
    <div className="overview-distributions">
      <div><h3><ChartNoAxesCombined size={18} aria-hidden="true" />사업장 규모</h3>{sizes.map((row) => <div className="distribution-row" key={row.label}>
        <span>{row.label}</span><div className="distribution-track"><div style={{ width: `${100 * row.workplaceCount / Math.max(1, statistics.activeWorkplaceCount)}%` }} /></div>
        <strong>{(100 * row.workplaceCount / Math.max(1, statistics.activeWorkplaceCount)).toFixed(1)}%<small>{formatNumber(row.workplaceCount)}곳</small></strong>
      </div>)}</div>
      <div><h3><Layers3 size={18} aria-hidden="true" />등록 사업장이 많은 업종</h3>{industries.slice(0, 5).map((row, index) =>
        <div className="industry-row" key={row.label}><b className="industry-rank">{String(index + 1).padStart(2, "0")}</b><span>{row.label}</span><strong>{formatNumber(row.workplaceCount)}곳</strong></div>)}</div>
    </div>
    <p className="caveat">공개된 등록 사업장 그룹 기준입니다. 가입자 합계는 사업장별 가입 건수로, 고유 근로자 수가 아닙니다. 업종 순위는 업종 미상·복수 업종을 제외합니다. 신고 업종·공개 범위 변경에 따라 통계에 차이가 발생할 수 있습니다.</p>
  </section>;
}
