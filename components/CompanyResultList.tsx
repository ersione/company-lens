import Link from "next/link";
import type { CompanySearchResult } from "@/lib/company-queries";
import { formatCurrency, formatIndustry, formatNumber, formatSnapshotMonth } from "@/lib/format";

export function CompanyResultList({ results }: { results: CompanySearchResult[] }) {
  if (results.length === 0) {
    return (
      <div className="empty-state">
        <strong>검색 결과가 없습니다.</strong>
        <span>국민연금 CSV를 가져온 뒤 회사명으로 다시 검색해 주세요.</span>
      </div>
    );
  }

  return (
    <div className="result-list">
      {results.map((company) => (
        <Link href={`/companies/${company.id}`} className="result-row" key={company.id}>
          <div className="result-main">
            <strong>{company.name}</strong>
            <span>{formatIndustry(company.industry)}</span>
            <small>{company.address ?? "주소 정보 없음"}</small>
          </div>
          <div className="result-metrics">
            <Metric label="기준월" value={formatSnapshotMonth(company.snapshotMonth)} />
            <Metric label="가입자수" value={`${formatNumber(company.employeeCount)}명`} />
            <Metric label="연봉 추정" value={formatCurrency(company.estimatedAverageAnnualSalary)} />
            <Metric label="취득/상실" value={`${formatNumber(company.newJoiners)} / ${formatNumber(company.departures)}`} />
          </div>
        </Link>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <b>{value}</b>
    </span>
  );
}
