"use client";

import { useState } from "react";

type SearchFormProps = {
  query: string;
  minEmployees?: string;
  region?: string;
  sort?: string;
};

const regions = [
  "서울특별시",
  "부산광역시",
  "대구광역시",
  "인천광역시",
  "광주광역시",
  "대전광역시",
  "울산광역시",
  "세종특별자치시",
  "경기도",
  "강원특별자치도",
  "충청북도",
  "충청남도",
  "전북특별자치도",
  "전라남도",
  "경상북도",
  "경상남도",
  "제주특별자치도"
];

export function SearchForm({ query, minEmployees = "", region = "", sort = "relevance" }: SearchFormProps) {
  const [isSearching, setIsSearching] = useState(false);

  return (
    <div className="search-form-wrap" data-searching={isSearching ? "true" : "false"}>
      <form action="/" className="search-form" onSubmit={() => setIsSearching(true)} aria-busy={isSearching}>
        <input
          name="q"
          defaultValue={query}
          placeholder="회사명 검색"
          aria-label="회사 검색"
          autoComplete="off"
          readOnly={isSearching}
        />
        <select name="minEmployees" defaultValue={minEmployees} aria-label="최소 가입자수" aria-disabled={isSearching}>
          <option value="">전체 규모</option>
          <option value="10">10명 이상</option>
          <option value="50">50명 이상</option>
          <option value="100">100명 이상</option>
          <option value="300">300명 이상</option>
          <option value="500">500명 이상</option>
          <option value="1000">1,000명 이상</option>
        </select>
        <select name="region" defaultValue={region} aria-label="지역" aria-disabled={isSearching}>
          <option value="">전체 지역</option>
          {regions.map((regionName) => (
            <option value={regionName} key={regionName}>
              {regionName}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} aria-label="검색 정렬" aria-disabled={isSearching}>
          <option value="relevance">관련도순</option>
          <option value="employees">가입자수순</option>
        </select>
        <button type="submit" disabled={isSearching}>
          {isSearching ? (
            <>
              <span className="search-spinner" aria-hidden="true" />
              검색중
            </>
          ) : (
            "검색"
          )}
        </button>
      </form>
      <div className="search-progress" role="status" aria-live="polite" hidden={!isSearching}>
        <span className="search-progress-bar" />
        <span>검색 결과를 불러오는 중입니다.</span>
      </div>
    </div>
  );
}
