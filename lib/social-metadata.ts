import type { Metadata } from "next";
import type { CompanyDetail } from "./company-queries";
import { formatCurrency, formatNumber, formatSnapshotMonth } from "./format";

export const publicOrigin = "https://companylens.ersione.com";
export const siteDescription = "회사별 가입자 수, 추정 평균 연봉과 월별 고용 추이를 확인하세요. 국민연금 공개 데이터로 보는 회사 정보, Company Lens.";

export function socialMetadata(title: string, description: string, path: string): Metadata {
  const image = { url: "/opengraph-image", width: 1200, height: 630, alt: "Company Lens · 국민연금 기반 회사 고용·급여 정보" };
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website", locale: "ko_KR", siteName: "Company Lens",
      title, description, url: path, images: [image]
    },
    twitter: { card: "summary_large_image", title, description, images: [image] }
  };
}

export function companySocialMetadata(company: CompanyDetail): Metadata {
  const facts = [
    company.snapshotMonth ? `${formatSnapshotMonth(company.snapshotMonth)} 기준` : null,
    company.employeeCount !== null ? `국민연금 가입자 ${formatNumber(company.employeeCount)}명` : null,
    company.estimatedAverageAnnualSalary !== null ? `추정 평균 연봉 ${formatCurrency(company.estimatedAverageAnnualSalary)}` : null
  ].filter(Boolean);
  const description = `${facts.length ? `${facts.join(" · ")}. ` : ""}월별 고용 추이와 회사 정보를 확인하세요. 국민연금 기반 추정치로 실제 급여·재직 인원과 다를 수 있습니다.`;
  return socialMetadata(`${company.name} 고용·연봉 정보 | Company Lens`, description, `/companies/${company.id}`);
}
