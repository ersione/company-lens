import { CompanyResultList } from "@/components/CompanyResultList";
import { SearchForm } from "@/components/SearchForm";
import { searchCompanies } from "@/lib/company-queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ q?: string; minEmployees?: string; page?: string; region?: string; showAll?: string; sort?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const minEmployees = parsePositiveInteger(params?.minEmployees);
  const page = parsePositiveInteger(params?.page) ?? 1;
  const region = params?.region?.trim() || null;
  const showAll = params?.showAll === "1";
  const sort = params?.sort === "employees" ? "employees" : "relevance";
  const searchOptions: Parameters<typeof searchCompanies>[1] = {
    minEmployees,
    page,
    region,
    sort
  };
  const countOnlySearch = query && !minEmployees && !showAll ? searchCompanies(query, { ...searchOptions, countOnly: true }) : null;
  const shouldAskToRefine = Boolean(countOnlySearch && countOnlySearch.totalPages >= 10);
  const search = query && !shouldAskToRefine
    ? searchCompanies(query, {
        ...searchOptions
      })
    : countOnlySearch;
  const results = search?.results ?? [];

  return (
    <main className="page-shell">
      <section className="search-section">
        <div>
          <p className="eyebrow">Local public-data MVP</p>
          <h1>회사명을 검색해 국민연금 기반 지표를 확인하세요.</h1>
          <p className="lede">
            공공데이터포털의 국민연금 사업장 데이터를 기준으로 가입자수, 입퇴사 흐름, 평균 급여 추정치를 보여줍니다.
          </p>
        </div>
        <SearchForm query={query} minEmployees={params?.minEmployees ?? ""} region={region ?? ""} sort={sort} />
        <p className="caveat">
          급여는 당월고지금액 / 가입자수 / 0.09로 계산한 국민연금 기반 추정치입니다. 실제 급여와 다를 수 있습니다.
        </p>
      </section>

      {query ? (
        <section className="results-section">
          <div className="section-heading">
            <h2>{`"${query}" 검색 결과`}</h2>
            <span>{search?.total ?? 0}개 중 {results.length}개 표시</span>
          </div>
          {shouldAskToRefine && search ? (
            <SearchRefinementPrompt query={query} region={region} sort={sort} total={search.total} totalPages={search.totalPages} />
          ) : (
            <>
              {search && search.totalPages >= 10 ? (
                <SearchRefinement query={query} minEmployees={minEmployees} region={region} sort={sort} />
              ) : null}
              <CompanyResultList results={results} />
              {search ? (
                <Pagination
                  query={query}
                  minEmployees={minEmployees}
                  region={region}
                  showAll={showAll}
                  sort={sort}
                  page={search.page}
                  totalPages={search.totalPages}
                />
              ) : null}
            </>
          )}
        </section>
      ) : null}
    </main>
  );
}

function parsePositiveInteger(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function SearchRefinementPrompt({
  query,
  region,
  sort,
  total,
  totalPages
}: {
  query: string;
  region: string | null;
  sort: "relevance" | "employees";
  total: number;
  totalPages: number;
}) {
  const allParams = new URLSearchParams({ q: query, showAll: "1", sort });
  if (region) {
    allParams.set("region", region);
  }

  return (
    <div className="search-refinement search-refinement-prompt">
      <div>
        <strong>{total.toLocaleString("ko-KR")}개 결과가 있습니다.</strong>
        <span>
          전체 {totalPages.toLocaleString("ko-KR")}페이지라 먼저 규모 기준으로 좁혀보는 것을 추천합니다.
        </span>
      </div>
      <div className="refinement-actions">
        <RefinementLinks query={query} region={region} sort={sort} />
        <a className="refinement-secondary" href={`/?${allParams.toString()}`}>
          전체 결과 보기
        </a>
      </div>
    </div>
  );
}

function SearchRefinement({
  query,
  minEmployees,
  region,
  sort
}: {
  query: string;
  minEmployees: number | null;
  region: string | null;
  sort: "relevance" | "employees";
}) {
  const options = [50, 100, 300, 500, 1000].filter((employees) => !minEmployees || employees > minEmployees);

  if (options.length === 0) {
    return null;
  }

  return (
    <div className="search-refinement">
      <div>
        <strong>검색 결과가 많습니다.</strong>
        <span>규모 기준을 적용하면 지점이나 소규모 사업장을 줄여서 볼 수 있습니다.</span>
      </div>
      <div className="refinement-actions">
        <RefinementLinks query={query} region={region} sort={sort} options={options} />
      </div>
    </div>
  );
}

function RefinementLinks({
  query,
  region,
  sort,
  options = [50, 100, 300, 500, 1000]
}: {
  query: string;
  region: string | null;
  sort: "relevance" | "employees";
  options?: number[];
}) {
  return options.map((employees) => {
    const params = new URLSearchParams({
      q: query,
      minEmployees: String(employees),
      sort: sort === "relevance" ? "employees" : sort
    });
    if (region) {
      params.set("region", region);
    }

    return (
      <a href={`/?${params.toString()}`} key={employees}>
        {employees.toLocaleString("ko-KR")}명 이상
      </a>
    );
  });
}

function Pagination({
  query,
  minEmployees,
  region,
  showAll,
  sort,
  page,
  totalPages
}: {
  query: string;
  minEmployees: number | null;
  region: string | null;
  showAll: boolean;
  sort: "relevance" | "employees";
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav className="pagination" aria-label="검색 결과 페이지">
      <PageLink
        label="이전"
        query={query}
        minEmployees={minEmployees}
        region={region}
        showAll={showAll}
        sort={sort}
        page={page - 1}
        disabled={page <= 1}
        direction="prev"
      />
      <div className="pagination-status" aria-current="page">
        <strong>{page}</strong>
        <span>/</span>
        <span>{totalPages}</span>
      </div>
      <PageLink
        label="다음"
        query={query}
        minEmployees={minEmployees}
        region={region}
        showAll={showAll}
        sort={sort}
        page={page + 1}
        disabled={page >= totalPages}
        direction="next"
      />
    </nav>
  );
}

function PageLink({
  label,
  query,
  minEmployees,
  region,
  showAll,
  sort,
  page,
  disabled,
  direction
}: {
  label: string;
  query: string;
  minEmployees: number | null;
  region: string | null;
  showAll: boolean;
  sort: "relevance" | "employees";
  page: number;
  disabled: boolean;
  direction: "prev" | "next";
}) {
  const content = (
    <>
      {direction === "prev" ? <span aria-hidden="true">‹</span> : null}
      <b>{label}</b>
      {direction === "next" ? <span aria-hidden="true">›</span> : null}
    </>
  );

  if (disabled) {
    return <span className="pagination-button pagination-disabled">{content}</span>;
  }

  const params = new URLSearchParams({ q: query, page: String(page), sort });
  if (minEmployees) {
    params.set("minEmployees", String(minEmployees));
  }
  if (region) {
    params.set("region", region);
  }
  if (showAll) {
    params.set("showAll", "1");
  }

  return <a className="pagination-button" href={`/?${params.toString()}`}>{content}</a>;
}
