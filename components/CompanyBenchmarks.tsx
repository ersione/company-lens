import { ArrowUpRight, ChartNoAxesCombined, UsersRound, Wallet } from "lucide-react";
import type { CompanyBenchmark } from "@/lib/company-benchmarks";
import { formatNumber, formatSnapshotMonth } from "@/lib/format";

export function CompanyBenchmarks({ benchmark, month, industry }: {
  benchmark: CompanyBenchmark | undefined; month: string | null; industry: string | null;
}) {
  if (!benchmark) return null;
  const metrics = [
    { name: "가입자 규모", icon: UsersRound, national: benchmark.employeeTopPercent, peer: benchmark.industryEmployeeTopPercent,
      count: benchmark.employeeSampleCount, peerCount: benchmark.industryEmployeeSampleCount, className: "size-benchmark" },
    { name: "추정 평균 연봉", icon: Wallet, national: benchmark.salaryTopPercent, peer: benchmark.industrySalaryTopPercent,
      count: benchmark.salarySampleCount, peerCount: benchmark.industrySalarySampleCount, className: "salary-benchmark" }
  ];
  return <section className="company-benchmarks" aria-labelledby="benchmarks-heading">
    <div className="benchmark-heading"><div><p className="eyebrow"><ChartNoAxesCombined size={15} aria-hidden="true" />MARKET POSITION</p>
      <h2 id="benchmarks-heading">다른 사업장과 비교하면</h2></div><span>{formatSnapshotMonth(month)} · 공개 사업장 기준</span></div>
    <div className="benchmark-grid">{metrics.map(({ name, icon: Icon, national, peer, count, peerCount, className }) =>
      <article className={`benchmark-item ${className}`} key={name}>
        <div className="benchmark-title"><span className="benchmark-icon"><Icon size={19} aria-hidden="true" /></span><h3>{name}</h3><span>전체 사업장</span></div>
        <div className="benchmark-value">{national === null ? <strong>비교 불가</strong> : <><span>상위</span><strong>{topPercent(national)}<small>%</small></strong></>}</div>
        {national !== null && <div className="percentile-scale" role="img" aria-label={`전체 사업장 기준 상위 ${topPercent(national)}퍼센트`}>
          <div className="percentile-track"><span style={{ left: `${Math.max(0, Math.min(100, 100 - national))}%` }} /></div>
          <div className="percentile-labels"><span>{name === "추정 평균 연봉" ? "낮음" : "작음"}</span><span>상위 50%</span><span>{name === "추정 평균 연봉" ? "높음" : "큼"}</span></div>
        </div>}
        <p className="benchmark-sample">{national === null ? "급여 비교에 필요한 유효한 자료가 없습니다." : `${formatNumber(count)}개 사업장 중 · 동률 포함`}</p>
        <div className="industry-benchmark"><div><span>동일 업종 내 위치</span><small>{industry ?? "업종 정보 없음"}</small></div>
          {peer === null ? <span className="peer-unavailable">비교 자료 부족</span> : <strong><ArrowUpRight size={16} aria-hidden="true" />상위 {topPercent(peer)}%</strong>}
        </div>
        {peer !== null && <p className="peer-sample">동일 업종 {formatNumber(peerCount)}개 사업장 기준</p>}
      </article>)}</div>
    <p className="benchmark-note">가입 상태인 사업장 중 유효한 값만 비교합니다. 연봉은 국민연금 기반 추정치로 소득 상한 등의 영향을 받습니다. 동일 업종은 비교 대상이 30곳 이상일 때 표시합니다.</p>
  </section>;
}

function topPercent(value: number) {
  if (value < 1) return Math.max(0.1, Math.ceil((value - 1e-9) * 10) / 10);
  return Math.max(1, Math.min(100, Math.ceil(value - 1e-9)));
}
