export function SearchForm({ query }: { query: string }) {
  return (
    <form action="/" className="search-form">
      <input
        name="q"
        defaultValue={query}
        placeholder="회사명 검색"
        aria-label="회사 검색"
        autoComplete="off"
      />
      <button type="submit">검색</button>
    </form>
  );
}
