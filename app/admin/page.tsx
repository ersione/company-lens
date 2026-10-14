import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Activity, ArrowUpRight, Building2, Clock3, Search, ShieldCheck, Users } from "lucide-react";
import { adminConfigured, adminCookie, validAdminSession } from "@/lib/admin-auth";
import { getAdminMetrics, adminFilters, sizeLabels } from "@/lib/admin-metrics";
import { AdminLogin, AdminLogout } from "@/components/AdminLogin";
import { AdminChart } from "@/components/AdminChart";
import "./admin.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "관리자 | Company Lens", robots: { index: false, follow: false },
  openGraph: { title: "Company Lens 관리자", description: "관리자 전용 페이지" }, twitter: { title: "Company Lens 관리자", description: "관리자 전용 페이지" } };
const colors = [0, 1, 2, 3, 4];
const sizeColors = ["neutral", 0, 1, 2, 3, 4, "ink"] as const;
const number = (n: number) => n.toLocaleString("ko-KR");
const ms = (n: number | null) => n === null ? "-" : `${number(Math.round(n))}ms`;

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const cookie = (await cookies()).get(adminCookie)?.value;
  if (!validAdminSession(cookie)) return <AdminLogin configured={adminConfigured()} />;
  const data = getAdminMetrics(adminFilters(await searchParams));
  const labels = data.dates.map((day) => day.slice(5).replace("-", "."));
  const totalViews = data.sizes.reduce((sum, row) => sum + row.total, 0);
  const emptyRate = data.totals.searches ? data.totals.empty / data.totals.searches * 100 : 0;
  const errorRate = data.totals.requests ? data.totals.errors5xx / data.totals.requests * 100 : 0;
  return <main className="page-shell admin-dashboard">
    <div className="admin-heading"><div><p className="eyebrow">OPERATIONS / COMPANY LENS</p><h1>서비스 이용 통계</h1><p>{data.dates[0]} — {data.dates.at(-1)} <span>· KST</span></p></div><AdminLogout /></div>
    <form className="admin-filters" action="/admin"><label>기간<select aria-label="기간" name="days" defaultValue={data.filters.days}><option value="7">최근 7일</option><option value="30">최근 30일</option><option value="90">최근 90일</option></select></label>
      <label>채널<select aria-label="채널" name="channel" defaultValue={data.filters.channel}><option value="all">웹 + API</option><option value="web">웹</option><option value="api">API</option></select></label>
      <button type="submit"><Activity size={16} />조회</button><span><ShieldCheck size={15} />관리자 전용</span></form>
    {data.error && <p role="alert" className="search-error">통계를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>}
    <section className="admin-kpis" aria-label="요약 지표">
      <div><span><Activity size={17} />처리 요청</span><strong>{number(data.totals.requests)}<small>건</small></strong><p>웹 {number(data.totals.web)} · API {number(data.totals.api)}</p></div>
      <div><span><Search size={17} />검색 요청</span><strong>{number(data.totals.searches)}<small>건</small></strong><p>첫 페이지 · 결과 없음 {emptyRate.toFixed(1)}%</p></div>
      <div><span><Building2 size={17} />사업장 상세 조회</span><strong>{number(data.totals.details)}<small>건</small></strong><p>성공한 웹·API 상세 요청</p></div>
      <div><span><Clock3 size={17} />평균 처리시간</span><strong>{ms(data.totals.averageMs)}</strong><p>p95 상한 {ms(data.totals.p95Ms)} · 서버 오류 {errorRate.toFixed(1)}%</p></div>
    </section>
    <div className="admin-grid">
      <section className="admin-tool admin-wide"><div className="admin-tool-heading"><h2><Activity size={18} />일별 이용 추이</h2><span>{number(data.totals.requests)}건</span></div>
        <AdminChart title="일별 웹·API 요청 추이" labels={labels} series={[
          { label: "웹 페이지", values: data.traffic.web, color: colors[0] }, { label: "API", values: data.traffic.api, color: colors[1] }
        ]} /></section>
      <section className="admin-tool"><div className="admin-tool-heading"><h2><Search size={18} />검색어 추이</h2><span>상위 5개</span></div>
        <AdminChart title="인기 검색어 일별 추이" labels={labels} series={data.terms.slice(0, 5).map((term, i) => ({ label: term.term, values: term.values, color: colors[i] }))} />
        <div className="admin-table-scroll"><table className="admin-table"><caption className="sr-only">검색어 순위</caption><thead><tr><th>검색어</th><th>검색</th><th>결과 없음</th></tr></thead><tbody>
          {data.terms.map((term, i) => <tr key={term.term}><td><span className="admin-rank">{i + 1}</span>{term.term}</td><td>{number(term.total)}</td><td>{number(term.empty)}</td></tr>)}
          {!data.terms.length && <tr><td colSpan={3}>검색 기록이 없습니다.</td></tr>}
        </tbody></table></div></section>
      <section className="admin-tool"><div className="admin-tool-heading"><h2><Building2 size={18} />자주 조회한 사업장</h2><span>상위 10개</span></div>
        <AdminChart title="자주 조회한 사업장 순위" labels={data.companies.map((row) => row.name)} kind="bar" horizontal series={[{ label: "상세 조회", values: data.companies.map((row) => row.views), color: colors[1] }]} />
        <ol className="admin-company-ranking">{data.companies.map((company, i) => <li key={company.id}><span className="admin-rank">{i + 1}</span><div>
          <Link href={`/companies/${company.id}`} prefetch={false} target="_blank" rel="noreferrer">{company.name}<ArrowUpRight size={13} /></Link>
          <small>{sizeLabels[company.sizeBand] ?? "인원 미상"} · {company.snapshotMonth || "기준월 미상"}</small></div><strong>{number(company.views)}<small>건</small></strong></li>)}</ol>
        {!data.companies.length && <p className="admin-empty">사업장 조회 기록이 없습니다.</p>}
      </section>
      <section className="admin-tool admin-wide"><div className="admin-tool-heading"><h2><Users size={18} />가입자 규모별 조회 추이</h2><span>{number(totalViews)}건</span></div>
        <AdminChart title="가입자 규모별 일별 상세 조회" labels={labels} kind="bar" stacked series={data.sizes.map((row, i) => ({ label: row.label, values: row.values, color: sizeColors[i] }))} />
        <div className="admin-size-shares">{data.sizes.map((row, i) => <div key={row.band}><span><i style={{ backgroundColor: row.band === "0" ? "var(--muted)" : row.band === "unknown" ? "var(--text)" : `var(--chart-series-${i})` }} />{row.label}</span><strong>{totalViews ? (row.total / totalViews * 100).toFixed(1) : "0.0"}%</strong><small>{number(row.total)}건</small></div>)}</div>
        <p className="admin-footnote">조회 당시 국민연금 가입자 규모 · 법적 기업 규모 분류와 무관 · 사업장 순위의 규모·기준월은 조회가 가장 많았던 관측값</p>
      </section>
      <section className="admin-tool"><div className="admin-tool-heading"><h2><Clock3 size={18} />서버 처리시간</h2><span>ms</span></div>
        <AdminChart title="일별 평균 및 p95 처리시간 상한" labels={labels} unit="ms" series={[
          { label: "평균", values: data.latency.average, color: colors[0] }, { label: "p95 상한", values: data.latency.p95, color: colors[2] }
        ]} /></section>
      <section className="admin-tool"><div className="admin-tool-heading"><h2><ShieldCheck size={18} />오류 추이</h2><span>4xx {number(data.totals.errors4xx)} · 5xx {number(data.totals.errors5xx)}</span></div>
        <AdminChart title="일별 HTTP 4xx 및 5xx 오류" labels={labels} kind="bar" series={[
          { label: "요청 오류 (4xx)", values: data.errors.client, color: "warning" }, { label: "서버 오류 (5xx)", values: data.errors.server, color: "error" }
        ]} /></section>
    </div>
    <p className="admin-footnote">고유 방문자가 아닌 백엔드 처리 요청 기준 · 캐시 응답·상태 점검 제외 · p95는 구간 기반 상한 · 최근 90일 보관</p>
  </main>;
}
