import Link from "next/link";
import { ArrowLeft, Plus, Search, X, GitCompareArrows } from "lucide-react";
import { getCompanyDetail, getCompanyHistory, getCompanyBenchmark, searchCompanies, type CompanySearchResult } from "@/lib/company-queries";
import { SearchTooBroadError } from "@/lib/company-search-guard";
import { employmentInsight, monthOffset, parseComparisonIds } from "@/lib/company-insights";
import { formatCurrency, formatNumber, formatSnapshotMonth } from "@/lib/format";
import { validateCompanySearch } from "@/lib/company-search-input";
import { socialMetadata } from "@/lib/social-metadata";
import { observeWebPage } from "@/lib/observe-usage";
import type { UsageEvent } from "@/lib/usage-metrics";

export const metadata = { ...socialMetadata("사업장 비교 | Company Lens", "사업장의 가입자 수, 국민연금 기반 추정 연봉과 고용 변화를 비교합니다.", "/compare"), robots: { index: false } };

async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }, usage: UsageEvent) {
  const params = await searchParams;
  const parsed: ReturnType<typeof parseComparisonIds> = params.ids === undefined ? { ids: [], error: null } : parseComparisonIds(typeof params.ids === "string" ? params.ids : "");
  const companies = parsed.ids.map((id) => getCompanyDetail(id));
  const missing = companies.some((company) => !company);
  const selected = companies.flatMap((company) => company ? [company] : []);
  const validated = validateCompanySearch(params.q, true);
  let results: CompanySearchResult[] = [];
  let searchError = validated.error;
  if (validated.query && !searchError && !parsed.error) {
    try { results = searchCompanies(validated.query, 10); }
    catch (cause) {
      if (!(cause instanceof SearchTooBroadError)) throw cause;
      searchError = cause.message;
    }
  }
  const href = (ids: number[]) => `/compare?${new URLSearchParams({ ...(ids.length ? { ids: ids.join(",") } : {}), ...(validated.query ? { q: validated.query } : {}) })}`;
  const rows = selected.map((company) => ({ company, benchmark: getCompanyBenchmark(company.id, company.snapshotMonth),
    insight: employmentInsight(company.snapshotMonth ? getCompanyHistory(company.id, { from: monthOffset(company.snapshotMonth, -12), to: company.snapshotMonth }) : []) }));
  if (validated.query || searchError) usage.search = { query: validated.query, page: 1,
    outcome: searchError || parsed.error ? "invalid" : results.length ? "matched" : "empty" };
  return <main className="page-shell compare-page">
    <Link className="back-link" href="/"><ArrowLeft size={16} aria-hidden="true" />회사 검색</Link>
    <div className="compare-heading"><p className="eyebrow">COMPANY COMPARISON</p><h1><GitCompareArrows size={28} aria-hidden="true" />사업장 비교</h1><span>{selected.length} / 3 선택</span></div>
    <form action="/compare" className="compare-search" role="search">
      {parsed.ids.length > 0 && <input type="hidden" name="ids" value={parsed.ids.join(",")} />}
      <label htmlFor="compare-query" className="sr-only">비교할 회사명</label>
      <input id="compare-query" name="q" type="search" defaultValue={validated.query} placeholder="비교할 회사명 검색" maxLength={100} required minLength={3} />
      <button type="submit" aria-label="회사 검색" title="회사 검색"><Search size={22} aria-hidden="true" /></button>
    </form>
    {(parsed.error || searchError || missing) && <p role="alert" className="search-error">{parsed.error || searchError || "일부 사업장을 찾을 수 없습니다. 선택을 해제하고 다시 검색하세요."}</p>}
    {results.length > 0 && <details className="comparison-search-results" open={selected.length < 3}>
      <summary>{validated.query} 검색 결과 · {results.length}개</summary><ul className="compare-candidates">{results.map((row) => <li key={row.id}>
      <div><strong>{row.name}</strong><span>{row.address ?? "주소 정보 없음"}</span></div>
      {parsed.ids.includes(row.id) ? <span>선택됨</span> : parsed.ids.length < 3
        ? <Link href={href([...parsed.ids, row.id])} aria-label={`${row.name} 비교 추가`} title="비교 추가"><Plus size={20} aria-hidden="true" /></Link>
        : <span>3개 선택됨</span>}
    </li>)}</ul></details>}
    {validated.query && !searchError && results.length === 0 && <p className="caveat">검색 결과가 없습니다.</p>}
    {selected.length > 0 ? <>
      {new Set(selected.map((row) => row.snapshotMonth)).size > 1 && <p className="comparison-warning">기준월이 서로 다릅니다. 같은 시점의 수치가 아니므로 비교에 주의하세요.</p>}
      <div className="comparison-scroll" tabIndex={0} role="region" aria-label="사업장 비교표">
        <table className="comparison-table" style={{ minWidth: 155 + rows.length * 230 }}><thead><tr><th scope="col">사업장</th>{rows.map(({ company }) => <th scope="col" key={company.id}>
          <div className="comparison-company"><Link href={`/companies/${company.id}`}>{company.name}</Link>
            <Link href={href(parsed.ids.filter((id) => id !== company.id))} title="선택 해제" aria-label={`${company.name} 선택 해제`}><X size={18} aria-hidden="true" /></Link></div>
        </th>)}</tr></thead><tbody>
          <tr><th scope="row">기준월</th>{rows.map(({ company }) => <td key={company.id}>{formatSnapshotMonth(company.snapshotMonth)}</td>)}</tr>
          <tr className="comparison-highlight"><th scope="row">국민연금 가입자</th>{rows.map(({ company }) => <td key={company.id}>{company.employeeCount === null ? "-" : `${formatNumber(company.employeeCount)}명`}</td>)}</tr>
          <tr className="comparison-highlight"><th scope="row">추정 평균 연봉</th>{rows.map(({ company }) => <td key={company.id}>{formatCurrency(company.estimatedAverageAnnualSalary)}</td>)}</tr>
          <tr><th scope="row">1년 전 대비 가입자</th>{rows.map(({ company, insight }) => <td key={company.id}>{insight.employeeDelta === null ? "비교 자료 없음" : `${insight.employeeDelta > 0 ? "+" : ""}${formatNumber(insight.employeeDelta)}명`}</td>)}</tr>
          <tr><th scope="row">동일 업종 규모 위치</th>{rows.map(({ company, benchmark }) => <td key={company.id}>{benchmark?.industryEmployeeTopPercent == null ? "비교 자료 부족" : `상위 ${Math.max(0.1, Math.ceil(benchmark.industryEmployeeTopPercent * 10) / 10)}%`}</td>)}</tr>
          <tr><th scope="row">동일 업종 급여 위치</th>{rows.map(({ company, benchmark }) => <td key={company.id}>{benchmark?.industrySalaryTopPercent == null ? "비교 자료 부족" : `상위 ${Math.max(0.1, Math.ceil(benchmark.industrySalaryTopPercent * 10) / 10)}%`}</td>)}</tr>
          <tr><th scope="row">신규취득 / 자격상실</th>{rows.map(({ company }) => <td key={company.id}>{formatNumber(company.newJoiners)} / {formatNumber(company.departures)}명</td>)}</tr>
          <tr><th scope="row">업종</th>{rows.map(({ company }) => <td key={company.id}>{company.industry ?? "업종 정보 없음"}</td>)}</tr>
          <tr><th scope="row">주소</th>{rows.map(({ company }) => <td key={company.id}>{company.address ?? "주소 정보 없음"}</td>)}</tr>
        </tbody></table>
      </div>
    </> : <div className="empty-state"><GitCompareArrows size={28} aria-hidden="true" /><strong>비교할 사업장을 선택하세요.</strong></div>}
    <p className="detail-caveat">국민연금 기반 추정치입니다. 공개 사업장 단위로, 법인 전체의 급여·인원과 다를 수 있습니다. 업종 위치는 각 사업장의 업종 안에서의 위치입니다.</p>
  </main>;
}

export default observeWebPage("compare", ComparePage);
