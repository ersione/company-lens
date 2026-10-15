import { Alert } from "@ersione/design-system/react";
import { CompanyResultList } from "@/components/CompanyResultList";
import { SearchForm } from "@/components/SearchForm";
import { SearchPagination } from "@/components/SearchPagination";
import { RecentCompanies } from "@/components/RecentCompanies";
import { getDatasetStatus, getStatisticsOverview, searchCompanyPage, type CompanySearchResult } from "@/lib/company-queries";
import { SearchTooBroadError } from "@/lib/company-search-guard";
import { DatasetOverview } from "@/components/DatasetOverview";
import { formatNumber, formatSnapshotMonth } from "@/lib/format";
import { validateCompanySearch } from "@/lib/company-search-input";
import { maxSearchPage, parseSearchOptions, searchHref } from "@/lib/company-search-options";
import Link from "next/link";
import { CalendarDays, ShieldCheck, CircleAlert } from "lucide-react";
import { observeWebPage } from "@/lib/observe-usage";
import type { UsageEvent } from "@/lib/usage-metrics";
import { homeMetadata, websiteStructuredData } from "@/lib/social-metadata";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: PageProps) {
  return homeMetadata(await searchParams ?? {});
}

async function Home({ searchParams }: PageProps, usage: UsageEvent) {
  const params = await searchParams;
  const validated = validateCompanySearch(params?.q, true);
  const { options, error: optionsError } = parseSearchOptions(params ?? {});
  const { query } = validated;
  let error = validated.error ?? optionsError;
  usage.operation = query || error ? "search" : "home";
  if (usage.operation === "search") usage.search = { query, page: options.page, outcome: "invalid" };
  let results: CompanySearchResult[] = [];
  let totalCount = 0;
  let totalPages = 0;
  if (query && !error) {
    try { ({ results, totalCount, totalPages } = searchCompanyPage(query, options)); }
    catch (cause) {
      if (!(cause instanceof SearchTooBroadError)) throw cause;
      error = cause.message;
    }
  }
  const dataset = getDatasetStatus();
  const searchMode = Boolean(query || error);
  const statistics = query || error ? undefined : getStatisticsOverview();
  usage.operation = searchMode ? "search" : "home";
  if (searchMode) usage.search = { query, page: options.page, outcome: error ? "invalid" : totalCount ? "matched" : "empty" };

  return (
    <main className={`page-shell${searchMode ? " search-results-view" : ""}`}>
      {!searchMode && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteStructuredData).replace(/</g, "\\u003c") }} />}
      <section className="search-section">
        {!searchMode && <div className="search-heading">
          <div>
            <p className="eyebrow">COMPANY EXPLORER</p>
            <h1>숫자로 보는 회사</h1>
            <p className="lede">가입자 수부터 추정 급여, 월별 고용 변화까지.</p>
          </div>
          <div className="dataset-stamp"><CalendarDays size={17} aria-hidden="true" /><div>
            <strong>{dataset ? `${formatSnapshotMonth(dataset.snapshotMonth)} 기준` : "등록된 데이터 없음"}</strong>
            {dataset && <span>국민연금 원본 {formatNumber(dataset.rowCount)}행</span>}
          </div></div>
        </div>}
        {error && <h1 className="search-error-heading">검색 조건을 확인해 주세요</h1>}
        <SearchForm key={`${query}:${error ?? ""}:${JSON.stringify(options)}`} query={query} error={error} options={options} />
        {error && <Alert tone="error" className="search-error" id="search-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></Alert>}
        {!searchMode && <RecentCompanies />}
        {!searchMode && <p className="caveat search-caveat"><ShieldCheck size={16} aria-hidden="true" />
          <span>급여는 국민연금 기반 추정치이며, 실제 급여와 다를 수 있습니다.</span>
        </p>}
      </section>

      {statistics && <DatasetOverview statistics={statistics} />}

      {query && !error && (
        <section className="results-section" aria-labelledby="search-results-title">
          <div className="section-heading search-results-heading">
            <h1 id="search-results-title"><span className="result-query">{query}</span>{" "}<span className="result-heading-label">검색 결과</span></h1>
            <div className="result-summary">
              <p className="result-total">총 <strong>{formatNumber(totalCount)}</strong>개</p>
              {totalPages > 0 && <p className="result-page-note">{options.page}페이지 / {formatNumber(totalPages)}페이지</p>}
            </div>
          </div>
          <p className="caveat result-source-note"><ShieldCheck size={15} aria-hidden="true" />국민연금 기반 추정치{dataset && ` · ${formatSnapshotMonth(dataset.snapshotMonth)} 기준`}</p>
          <CompanyResultList results={results} latestMonth={dataset?.snapshotMonth} />
          {options.page > Math.max(1, totalPages) && <p className="caveat">요청한 페이지에 결과가 없습니다. <Link href={searchHref(query, { ...options, page: 1 })} prefetch={false}>첫 페이지로 돌아가기</Link></p>}
          <SearchPagination query={query} options={options} totalPages={totalPages} />
          {totalPages > maxSearchPage && <p className="caveat">최대 {formatNumber(maxSearchPage)}페이지까지 조회할 수 있습니다. 지역·가입자 규모 또는 회사명으로 검색을 좁혀 주세요.</p>}
        </section>
      )}
    </main>
  );
}

export default observeWebPage("home", Home);
