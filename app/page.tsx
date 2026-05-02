import { CompanyResultList } from "@/components/CompanyResultList";
import { SearchForm } from "@/components/SearchForm";
import { searchCompanies } from "@/lib/company-queries";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ q?: string }>;
};

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const query = params?.q?.trim() ?? "";
  const results = query ? searchCompanies(query) : [];

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
        <SearchForm query={query} />
        <p className="caveat">
          급여는 당월고지금액 / 가입자수 / 0.09로 계산한 국민연금 기반 추정치입니다. 실제 급여와 다를 수 있습니다.
        </p>
      </section>

      {query ? (
        <section className="results-section">
          <div className="section-heading">
            <h2>{`"${query}" 검색 결과`}</h2>
            <span>{results.length}개 표시</span>
          </div>
          <CompanyResultList results={results} />
        </section>
      ) : null}
    </main>
  );
}
