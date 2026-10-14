import { Badge } from "@ersione/design-system/react";
import Link from "next/link";
import type { CompanySearchResult } from "@/lib/company-queries";
import { formatCurrency, formatIndustry, formatNumber, formatSnapshotMonth } from "@/lib/format";
import { ArrowUpRight, Building2, MapPin, SearchX } from "lucide-react";

export function CompanyResultList({ results, latestMonth }: { results: CompanySearchResult[]; latestMonth?: string }) {
  if (results.length === 0) {
    return (
      <div className="empty-state">
        <SearchX size={24} aria-hidden="true" />
        <strong>검색 결과가 없습니다.</strong>
        <span>검색어·필터를 바꾸거나 이전 페이지를 확인해 주세요.</span>
      </div>
    );
  }

  return (
    <div className="result-list">
      {results.map((company) => (
        <Link href={`/companies/${company.id}`} className="result-row" key={company.id}>
          <div className="result-main">
            <strong><Building2 size={18} aria-hidden="true" />{company.name}</strong>
            <span>{formatIndustry(company.industry)}</span>
            <small><MapPin size={13} aria-hidden="true" />{company.address ?? "주소 정보 없음"}</small>
            {latestMonth && company.snapshotMonth !== latestMonth && <Badge className="historical-workplace" tone="warning">
              최신 자료에 없음 · 마지막 관측 {formatSnapshotMonth(company.snapshotMonth)}
            </Badge>}
          </div>
          <div className="result-metrics">
            <Metric label="기준월" value={formatSnapshotMonth(company.snapshotMonth)} />
            <Metric tone="people" label="가입자수" value={`${formatNumber(company.employeeCount)}명`} />
            <Metric tone="salary" label="연봉 추정" value={formatCurrency(company.estimatedAverageAnnualSalary)} />
            <Metric tone="flow" label="취득/상실" value={`${formatNumber(company.newJoiners)} / ${formatNumber(company.departures)}`} />
          </div>
          <ArrowUpRight className="result-arrow" size={20} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "people" | "salary" | "flow" }) {
  return (
    <span data-tone={tone}>
      <small>{label}</small>
      <b>{value}</b>
    </span>
  );
}
