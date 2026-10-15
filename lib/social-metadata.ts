import type { Metadata } from "next";
import type { CompanyDetail } from "./company-queries";
import { formatCurrency, formatNumber, formatSnapshotMonth } from "./format";
import { validateCompanySearch } from "./company-search-input";
import { parseSearchOptions } from "./company-search-options";

export const publicOrigin = "https://companylens.ersione.com";
export const siteTitle = "숫자로 보는 회사 | Company Lens";
export const siteDescription = "숫자로 보는 회사. 국민연금 공개 데이터로 살펴보는 가입자 수, 추정 평균 급여와 월별 고용 변화. 급여는 국민연금 기반 추정치입니다.";
export const socialImageAlt = "Company Lens · 숫자로 보는 회사";

export function homeMetadata(params: Record<string, string | string[] | undefined>): Metadata {
  const { query, error } = validateCompanySearch(params.q, true);
  const { error: optionsError } = parseSearchOptions(params);
  if (!query && !error && !optionsError) return socialMetadata(siteTitle, siteDescription, "/");
  return {
    ...socialMetadata(error || optionsError ? "검색 조건 확인 | Company Lens" : `${query} 검색 결과 | Company Lens`,
      "회사명을 검색하고 국민연금 가입자 수와 추정 급여, 월별 고용 변화를 확인하세요.", "/"),
    robots: { index: false, follow: true }
  };
}

export const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${publicOrigin}/#website`,
  url: `${publicOrigin}/`,
  name: "Company Lens",
  alternateName: "숫자로 보는 회사",
  description: siteDescription,
  inLanguage: "ko-KR"
};

export function socialMetadata(title: string, description: string, path: string): Metadata {
  const image = { url: "/opengraph-image", width: 1200, height: 630, alt: socialImageAlt };
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
