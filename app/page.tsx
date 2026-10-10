import { CompanyResultList } from "@/components/CompanyResultList";
import { SearchForm } from "@/components/SearchForm";
import { getDatasetStatus, getStatisticsOverview, searchCompanyPage } from "@/lib/company-queries";
import { DatasetOverview } from "@/components/DatasetOverview";
import { formatNumber, formatSnapshotMonth } from "@/lib/format";
import { validateCompanySearch } from "@/lib/company-search-input";
import { maxSearchPage, parseSearchOptions, searchHref } from "@/lib/company-search-options";
import Link from "next/link";
import { ArrowUpRight, Building2, CalendarDays, ShieldCheck, CircleAlert, ChevronLeft, ChevronRight } from "lucide-react";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const validated = validateCompanySearch(params?.q, true);
  const { options, error: optionsError } = parseSearchOptions(params ?? {});
  const { query } = validated;
  const error = validated.error ?? optionsError;
  const { results, hasMore } = query && !error ? searchCompanyPage(query, options) : { results: [], hasMore: false };
  const dataset = getDatasetStatus();
  const statistics = query || error ? undefined : getStatisticsOverview();

  return (
    <main className="page-shell">
      <section className="search-section">
        <div className="search-heading">
          <div>
            <p className="eyebrow">COMPANY EXPLORER</p>
            <h1>회사 고용·급여 검색</h1>
            <p className="lede">가입자 수부터 추정 급여, 월별 고용 변화까지.</p>
          </div>
          <div className="dataset-stamp"><CalendarDays size={17} aria-hidden="true" /><div>
            <strong>{dataset ? `${formatSnapshotMonth(dataset.snapshotMonth)} 기준` : "등록된 데이터 없음"}</strong>
            {dataset && <span>국민연금 원본 {formatNumber(dataset.rowCount)}행</span>}
          </div></div>
        </div>
        <SearchForm key={`${query}:${error ?? ""}:${JSON.stringify(options)}`} query={query} error={error} options={options} />
        {error && <p className="search-error" id="search-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{error}</span></p>}
        <nav className="example-searches" aria-label="예시 검색어">
          <span className="example-label">바로 검색</span>
          <div className="example-links">{["삼성전자", "네이버", "현대자동차"].map((name, index) =>
            <Link key={name} href={`/?q=${encodeURIComponent(name)}`} prefetch={false} className={`example-company example-company-${index}`}>
              <Building2 size={18} aria-hidden="true" /><span>{name}</span><ArrowUpRight size={16} aria-hidden="true" />
            </Link>)}</div>
        </nav>
        <p className="caveat search-caveat"><ShieldCheck size={16} aria-hidden="true" />
          <span>급여는 국민연금 기반 추정치이며, 실제 급여와 다를 수 있습니다.</span>
        </p>
      </section>

      {statistics && <DatasetOverview statistics={statistics} />}

      {query && !error && (
        <section className="results-section">
          <div className="section-heading">
            <h2>{`"${query}" 검색 결과`}</h2>
            <span>{options.page}페이지 · {results.length}개 표시</span>
          </div>
          <CompanyResultList results={results} />
          {(options.page > 1 || hasMore) && <nav className="search-pagination" aria-label="검색 결과 페이지">
            {options.page > 1 ? <Link href={searchHref(query, { ...options, page: options.page - 1 })} prefetch={false}><ChevronLeft size={18} aria-hidden="true" />이전</Link>
              : <span aria-disabled="true"><ChevronLeft size={18} aria-hidden="true" />이전</span>}
            <strong aria-current="page">{options.page}페이지</strong>
            {hasMore && options.page < maxSearchPage ? <Link href={searchHref(query, { ...options, page: options.page + 1 })} prefetch={false}>다음<ChevronRight size={18} aria-hidden="true" /></Link>
              : <span aria-disabled="true">다음<ChevronRight size={18} aria-hidden="true" /></span>}
          </nav>}
          {hasMore && options.page === maxSearchPage && <p className="caveat">더 많은 결과는 지역·가입자 규모 또는 회사명으로 좁혀 검색하세요.</p>}
        </section>
      )}
    </main>
  );
}
