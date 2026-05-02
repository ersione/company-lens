import Link from "next/link";
import { notFound } from "next/navigation";
import { CompanyCharts } from "@/components/CompanyCharts";
import { getCompanyDetail, getCompanyHistory } from "@/lib/company-queries";
import { formatCurrency, formatIndustry, formatNumber, formatSnapshotMonth, isDataQualityIndustry } from "@/lib/format";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CompanyPage({ params }: PageProps) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) {
    notFound();
  }

  const company = getCompanyDetail(companyId);
  if (!company) {
    notFound();
  }
  const history = getCompanyHistory(companyId);
  const chartHistory = [...history].reverse();
  const industryLabel = formatIndustry(company.industry);

  return (
    <main className="page-shell detail-page">
      <Link href="/" className="back-link">
        ← 검색으로 돌아가기
      </Link>

      <section className="company-header">
        <div>
          <p className="eyebrow">{formatSnapshotMonth(company.snapshotMonth)} 기준</p>
          <h1>{company.name}</h1>
          <p>{industryLabel}</p>
          <p>{company.address ?? "주소 정보 없음"}</p>
        </div>
        <div className="source-note">
          <strong>국민연금 기반 추정치</strong>
          <span>소득 상한, 신고 기준, 가입 제외 대상 때문에 실제 급여 및 인원과 차이가 날 수 있습니다.</span>
        </div>
      </section>

      <section className="metric-grid">
        <Stat label="추정 평균 연봉" value={formatCurrency(company.estimatedAverageAnnualSalary)} />
        <Stat label="추정 평균 월급" value={formatCurrency(company.estimatedAverageMonthlySalary)} />
        <Stat label="가입자수" value={`${formatNumber(company.employeeCount)}명`} />
        <Stat label="신규취득자수" value={`${formatNumber(company.newJoiners)}명`} />
        <Stat label="상실가입자수" value={`${formatNumber(company.departures)}명`} />
        <Stat label="당월고지금액" value={`${formatNumber(company.monthlyBilledAmount)}원`} />
      </section>

      <section className="trend-section">
        <div className="section-title-row">
          <h2>월별 추이</h2>
          <span>{history.length}개 스냅샷</span>
        </div>
        <CompanyCharts history={chartHistory} />
      </section>

      <section className="detail-columns detail-columns-single">
        <div>
          <h2>회사 정보</h2>
          <dl className="info-list">
            <div>
              <dt>사업자등록번호</dt>
              <dd>{company.registrationNumber ?? "-"}</dd>
            </div>
            <div>
              <dt>업종</dt>
              <dd>{industryLabel}</dd>
            </div>
            {isDataQualityIndustry(company.industry) ? (
              <div>
                <dt>원본 업종 표식</dt>
                <dd>{company.industry}</dd>
              </div>
            ) : null}
            <div>
              <dt>도로명주소</dt>
              <dd>{company.roadAddress ?? "-"}</dd>
            </div>
            <div>
              <dt>지번주소</dt>
              <dd>{company.lotAddress ?? "-"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="calculation-note">
        <h2>계산 기준</h2>
        <p>
          추정 평균 월급은 당월고지금액을 가입자수와 국민연금 보험료율 9%로 나누어 계산합니다. 추정 평균 연봉은 이 월급
          추정치에 12를 곱합니다. 가입자수가 없거나 0명인 행은 급여 추정치를 산출하지 않습니다.
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
