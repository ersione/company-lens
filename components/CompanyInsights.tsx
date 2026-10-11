import Link from "next/link";
import { ArrowUpRight, History, TrendingUp, Search } from "lucide-react";
import { employmentInsight, employmentNarrative, relatedNameQuery } from "@/lib/company-insights";
import type { CompanyDetail, SnapshotHistory } from "@/lib/company-queries";
import { getCompanyNames, getCompanyRecordCandidates, searchCompanySuggestions } from "@/lib/company-queries";
import { formatNumber, formatSnapshotMonth } from "@/lib/format";

export function EmploymentSummary({ history }: { history: SnapshotHistory[] }) {
  const insight = employmentInsight(history);
  return <section className="employment-summary" aria-labelledby="employment-summary-heading">
    <div className="insight-heading"><TrendingUp size={20} aria-hidden="true" /><h2 id="employment-summary-heading">최근 고용 흐름</h2></div>
    <p className="employment-narrative">{employmentNarrative(insight)}</p>
    <div className="employment-summary-grid">
      <div><span>1년 전 대비 가입자</span><strong>{insight.employeeDelta === null ? "비교 자료 없음"
        : `${insight.employeeDelta > 0 ? "+" : ""}${formatNumber(insight.employeeDelta)}명`}</strong>
        <small>{insight.employeeChangePercent === null ? "1년 전 같은 달의 유효한 자료가 필요합니다."
          : `${insight.employeeChangePercent > 0 ? "+" : ""}${insight.employeeChangePercent.toFixed(1)}% · ${formatSnapshotMonth(insight.yearAgoMonth)} 대비`}</small></div>
      <div><span>가입자 연속 변화</span><strong>{insight.consecutiveMonths === 0 ? "비교 자료 없음"
        : `${insight.consecutiveMonths}개월 연속 ${insight.direction === "up" ? "증가" : insight.direction === "down" ? "감소" : "유지"}`}</strong>
        <small>최신 기준월까지 · 누락된 달은 연결하지 않습니다.</small></div>
      <div><span>1년 전 대비 추정 연봉</span><strong>{insight.annualSalaryChangePercent === null ? "비교 자료 없음"
        : `${insight.annualSalaryChangePercent > 0 ? "+" : ""}${insight.annualSalaryChangePercent.toFixed(1)}%`}</strong>
        <small>국민연금 기반 추정치 · 보험료율은 기준월별 적용</small></div>
    </div>
    <div className="employment-long-term">
      <div className="three-year-summary"><span>3년 전 대비 가입자</span>
        <strong>{insight.threeYearEmployeeDelta === null ? "비교 자료 없음"
          : `${insight.threeYearEmployeeDelta > 0 ? "+" : ""}${formatNumber(insight.threeYearEmployeeDelta)}명`}
          {insight.threeYearEmployeeChangePercent !== null && <small>{insight.threeYearEmployeeChangePercent > 0 ? "+" : ""}{insight.threeYearEmployeeChangePercent.toFixed(1)}%</small>}</strong>
        <p>{insight.threeYearEmployeeDelta === null ? "3년 전 같은 달의 유효한 자료가 필요합니다."
          : `${formatSnapshotMonth(insight.threeYearsAgoMonth)} ${formatNumber(insight.threeYearsAgoEmployeeCount)}명 → ${formatSnapshotMonth(insight.snapshotMonth)} ${formatNumber(insight.latestEmployeeCount)}명`}</p>
      </div>
      <div className="annual-movement"><span>최근 12개월 취득·상실</span>
        <dl><div><dt>신규취득</dt><dd>{insight.twelveMonthNewJoiners === null ? "자료 부족" : `${formatNumber(insight.twelveMonthNewJoiners)}명`}</dd></div>
          <div><dt>자격상실</dt><dd>{insight.twelveMonthDepartures === null ? "자료 부족" : `${formatNumber(insight.twelveMonthDepartures)}명`}</dd></div></dl>
        <p>12개월 자료가 모두 있을 때 합산 · 실제 입·퇴사 및 고유 인원과 다를 수 있습니다.</p>
      </div>
    </div>
  </section>;
}

export function CompanyConnections({ company }: { company: CompanyDetail }) {
  const names = getCompanyNames(company.id);
  const recordCandidates = getCompanyRecordCandidates(company.id);
  const query = relatedNameQuery(company.name);
  const candidates = query ? searchCompanySuggestions(query, 7).filter((row) => row.id !== company.id).slice(0, 6) : [];
  return <section className="company-connections" aria-label="명칭과 유사 사업장">
    <div className="observed-names"><div className="insight-heading"><History size={20} aria-hidden="true" /><h2>수집된 사업장명</h2></div>
      {names.length ? <ul>{names.map((row) => <li key={row.name}><strong>{row.name}</strong>
        <span>{row.firstSeenMonth} ~ {row.lastSeenMonth} 관측</span></li>)}</ul> : <p>{company.name}</p>}
      <p className="caveat">명칭 기록은 기능 도입 후 가져온 자료부터 쌓입니다. 관측월 범위는 법적 상호 변경일이나 연속 사용 기간이 아닙니다. 다른 사업장의 이력은 합치지 않습니다.</p>
      {recordCandidates.length > 0 && <div className="record-candidates related-workplaces">
        <h3>이전·이후 명칭 후보</h3>
        <p className="caveat">공개 번호·주소가 같고 이름이 유사하며 관측 월이 맞닿는 기록입니다. 번호가 일부만 공개될 수 있어 동일 사업장이나 상호 변경이 확정된 것은 아닙니다.</p>
        <ul>{recordCandidates.map((row) => <li key={row.id}><Link href={`/companies/${row.id}`} prefetch={false}>
          <div><span className="record-direction">{row.direction === "earlier" ? "이전 기록 후보" : "이후 기록 후보"}</span>
            <strong>{row.name}</strong><span>{formatSnapshotMonth(row.firstMonth)} ~ {formatSnapshotMonth(row.lastMonth)} 관측</span></div>
          <ArrowUpRight size={18} aria-hidden="true" />
        </Link></li>)}</ul>
      </div>}
    </div>
    <div className="related-workplaces"><div className="insight-heading"><Search size={20} aria-hidden="true" /><h2>유사 이름 사업장</h2></div>
      <p className="caveat">이름 검색 후보입니다. 동일 법인·계열사 여부는 확인되지 않았습니다.</p>
      <ul>{candidates.map((row) => <li key={row.id}><Link href={`/companies/${row.id}`} prefetch={false}>
        <div><strong>{row.name}</strong><span>{row.address ?? "주소 정보 없음"} · {formatSnapshotMonth(row.snapshotMonth)}</span></div><ArrowUpRight size={17} aria-hidden="true" />
      </Link></li>)}</ul>
      {!candidates.length && <p className="caveat">표시할 검색 후보가 없습니다.</p>}
      {query && <Link className="back-link" href={`/?q=${encodeURIComponent(query)}`}>이 이름으로 더 검색 <ArrowUpRight size={16} aria-hidden="true" /></Link>}
    </div>
  </section>;
}
