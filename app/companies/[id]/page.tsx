import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getCompanyBenchmark, getCompanyDetail, getCompanyHistory } from "@/lib/company-queries";
import { formatCurrency, formatIndustry, formatNumber, formatSnapshotMonth } from "@/lib/format";
import { pensionRateForMonth, PENSION_RATE_SOURCE_URL } from "@/lib/pension";
import { CompanyHistoryChart } from "@/components/CompanyHistoryChart";
import { ArrowLeft, ArrowUpRight, Building2, MapPin, BriefcaseBusiness, Users, Wallet, ArrowRightLeft, Database, Info, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { netSubscribers, percentageChange, previousMonthSnapshot } from "@/lib/company-metrics";
import { CompanyBenchmarks } from "@/components/CompanyBenchmarks";
import { companySocialMetadata } from "@/lib/social-metadata";

type PageProps = {
  params: Promise<{ id: string }>;
};

const loadCompany = cache((id: string) => {
  if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) notFound();
  const company = getCompanyDetail(Number(id));
  if (!company) notFound();
  return company;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return companySocialMetadata(loadCompany((await params).id));
}

export default async function CompanyPage({ params }: PageProps) {
  const { id } = await params;
  const company = loadCompany(id);
  const companyId = company.id;
  const history = getCompanyHistory(companyId);
  const benchmark = getCompanyBenchmark(companyId, company.snapshotMonth);
  const previous = previousMonthSnapshot(history, company.snapshotMonth);
  const salaryChange = percentageChange(company.estimatedAverageAnnualSalary, previous?.estimatedAverageAnnualSalary);
  const employeeChange = company.employeeCount !== null && previous?.employeeCount != null
    ? company.employeeCount - previous.employeeCount : null;
  const net = netSubscribers(company.newJoiners, company.departures);

  return (
    <main className="page-shell detail-page">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> 검색으로 돌아가기
      </Link>

      <section className="company-header">
        <div className="company-identity">
          <div className="company-kicker"><Building2 size={18} aria-hidden="true" /><span>사업장 정보</span><span className="detail-date">{formatSnapshotMonth(company.snapshotMonth)} 기준</span></div>
          <h1>{company.name}</h1>
          <div className="company-meta">
            <span><BriefcaseBusiness size={15} aria-hidden="true" />{formatIndustry(company.industry)}</span>
            <span><MapPin size={15} aria-hidden="true" />{company.address ?? "주소 정보 없음"}</span>
          </div>
        </div>
        <a className="detail-source" href="https://www.data.go.kr/data/15083277/fileData.do" target="_blank" rel="noreferrer">
          <Database size={15} aria-hidden="true" /><span>국민연금공단</span><ArrowUpRight size={14} aria-hidden="true" />
        </a>
      </section>

      <section className="detail-metrics" aria-label="주요 지표">
        <div className="detail-metric salary-metric">
          <span className="metric-label"><Wallet size={17} aria-hidden="true" />추정 평균 연봉</span>
          <strong>{formatCurrency(company.estimatedAverageAnnualSalary)}</strong>
          <MonthChange value={salaryChange === null ? null : Number(salaryChange.toFixed(1))} unit="%" />
          <div className="metric-secondary monthly-salary"><span>추정 평균 월급</span><strong>{formatCurrency(company.estimatedAverageMonthlySalary)}</strong></div>
        </div>
        <div className="detail-metric subscriber-metric">
          <span className="metric-label"><Users size={17} aria-hidden="true" /><span><span className="metric-label-context">국민연금 </span>가입자 수</span></span>
          <strong>{withUnit(company.employeeCount, "명")}</strong>
          <MonthChange value={employeeChange} unit="명" />
          <div className="metric-secondary history-coverage"><strong>{history.length}개월</strong><span>고용 이력</span></div>
        </div>
        <div className="detail-metric movement-metric">
          <span className="metric-label"><ArrowRightLeft size={17} aria-hidden="true" />취득·상실 순증</span>
          <strong>{net === null ? "-" : `${signed(net)}명`}</strong>
          <span className="metric-comparison metric-formula">신규취득 − 자격상실</span>
          <dl className="movement-breakdown">
            <div className="joiners"><dt>신규취득</dt><dd>{withUnit(company.newJoiners, "명")}</dd></div>
            <div className="departures"><dt>자격상실</dt><dd>{withUnit(company.departures, "명")}</dd></div>
          </dl>
        </div>
      </section>
      <p className="detail-caveat"><Info size={15} aria-hidden="true" />국민연금 기반 추정치로, 실제 급여·재직 인원 및 입·퇴사와 다를 수 있습니다.</p>

      <CompanyBenchmarks benchmark={benchmark} month={company.snapshotMonth} industry={company.industry} />

      <div className="detail-workspace">
        <CompanyHistoryChart history={history} />
        <section className="company-facts" aria-labelledby="company-facts-heading">
          <h2 id="company-facts-heading"><Building2 size={18} aria-hidden="true" />사업장 기본 정보</h2>
          <dl className="info-list">
            <div>
              <dt>사업자등록번호{company.registrationNumber?.length !== 10 && company.registrationNumber ? " (일부 공개)" : ""}</dt>
              <dd>{company.registrationNumber ?? "-"}</dd>
            </div>
            <div>
              <dt>도로명주소</dt>
              <dd>{company.roadAddress ?? "-"}</dd>
            </div>
            <div>
              <dt>지번주소</dt>
              <dd>{company.lotAddress ?? "-"}</dd>
            </div>
            <div>
              <dt>출처</dt>
              <dd>국민연금공단</dd>
            </div>
          </dl>
          <p className="facts-note">공개된 사업장 단위의 정보이며, 법인 전체와 다를 수 있습니다.</p>
        </section>
      </div>

      <section className="monthly-records">
        <details className="history-data">
          <summary>월별 원자료 · {history.length}개월</summary>
          <div className="history-table">
            <table>
              <thead>
                <tr>
                  <th>기준월</th>
                  <th>가입자수</th>
                  <th>연봉 추정</th>
                  <th>취득</th>
                  <th>상실</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((snapshot) => (
                  <tr key={snapshot.snapshotMonth}>
                    <td>{formatSnapshotMonth(snapshot.snapshotMonth)}</td>
                    <td>{formatNumber(snapshot.employeeCount)}</td>
                    <td>{formatCurrency(snapshot.estimatedAverageAnnualSalary)}</td>
                    <td>{formatNumber(snapshot.newJoiners)}</td>
                    <td>{formatNumber(snapshot.departures)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="calculation-note">
        <details>
          <summary>출처 및 산정 기준 <Info size={15} aria-hidden="true" /></summary>
          <div className="calculation-body">
            <p><strong>국민연금공단 · 국민연금 가입 사업장 내역</strong><br />{formatSnapshotMonth(company.snapshotMonth)} 기준 · 당월고지금액 {withUnit(company.monthlyBilledAmount, "원")}</p>
            <p>
              추정 평균 월급은 당월고지금액을 가입자수와 해당 기준월의 국민연금 보험료율 {company.snapshotMonth ? (pensionRateForMonth(company.snapshotMonth) * 100).toFixed(1) : "-"}%로 나누어 계산합니다. 추정 평균 연봉은 이 월급
              추정치에 12를 곱합니다. 가입자수가 없거나 0명인 행은 급여 추정치를 산출하지 않습니다.
            </p>
            <p>사업자등록번호가 일부만 공개된 경우 회사명·주소·공개된 번호를 기준으로 구분합니다. 동일한 기준월에 같은 식별키의 사업장이 여러 행이면 인원과 고지금액 등을 합산하므로 법인 전체를 정확히 식별한 수치와 다를 수 있습니다.</p>
            <p>
              <a href="https://www.data.go.kr/data/15083277/fileData.do" target="_blank" rel="noreferrer">국민연금공단 공개 데이터</a>
              {" · "}<a href={PENSION_RATE_SOURCE_URL} target="_blank" rel="noreferrer">국민연금 보험료율 안내</a>
            </p>
          </div>
        </details>
      </section>
    </main>
  );
}

function withUnit(value: number | null, unit: string) {
  return value === null ? "-" : `${formatNumber(value)}${unit}`;
}

function MonthChange({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) return <div className="metric-comparison">전월 비교 자료 없음</div>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return <div className="metric-comparison" data-direction={value > 0 ? "up" : value < 0 ? "down" : "flat"}>
    <span>전월 대비</span><strong><Icon size={17} aria-hidden="true" />{signed(value)}{unit}</strong>
  </div>;
}

function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatNumber(Math.abs(value))}`;
}
