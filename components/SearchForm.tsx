"use client";

import Form from "next/form";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { ArrowRight, LoaderCircle, Search, MapPin, Users, ArrowDownWideNarrow, RotateCcw } from "lucide-react";
import { regions, regionLabels, defaultSearchOptions, type SearchOptions } from "@/lib/company-search-options";

export function SearchForm({ query, error, options = defaultSearchOptions }: { query: string; error?: string | null; options?: SearchOptions }) {
  const sizes = [10, 50, 100, 300, 500, 1000];
  if (options.minEmployees !== null && !sizes.includes(options.minEmployees)) sizes.push(options.minEmployees);
  const filtered = options.region || options.minEmployees !== null || options.sort !== "relevance";
  return (
    <Form action="/" className="company-search-form" role="search">
      <div className="search-form">
        <Search className="search-input-icon" size={22} aria-hidden="true" />
        <input
          name="q"
          defaultValue={query}
          placeholder="회사명 또는 사업자등록번호 검색"
          aria-label="회사 검색"
          aria-invalid={!!error}
          aria-describedby={error ? "search-error" : undefined}
          autoComplete="off"
          maxLength={100}
        />
        <SearchButton />
      </div>
      <div className="search-filters">
        <label><span><MapPin size={15} aria-hidden="true" />지역</span>
          <select name="region" aria-label="지역" defaultValue={options.region} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
            <option value="">전체 지역</option>{regions.map((region, index) => <option key={region} value={region}>{regionLabels[index]}</option>)}
          </select>
        </label>
        <label><span><Users size={15} aria-hidden="true" />가입자 규모</span>
          <select name="minEmployees" aria-label="가입자 규모" defaultValue={options.minEmployees ?? ""} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
            <option value="">전체 규모</option>{sizes.sort((a, b) => a - b).map((size) => <option key={size} value={size}>{size.toLocaleString("ko-KR")}명 이상</option>)}
          </select>
        </label>
        <label><span><ArrowDownWideNarrow size={15} aria-hidden="true" />정렬</span>
          <select name="sort" aria-label="정렬" defaultValue={options.sort} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
            <option value="relevance">관련도순</option><option value="employees">가입자 수순</option>
          </select>
        </label>
        {filtered && <Link className="filter-reset" href={`/?q=${encodeURIComponent(query)}`} prefetch={false}><RotateCcw size={15} aria-hidden="true" />초기화</Link>}
      </div>
    </Form>
  );
}

function SearchButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-label="검색" aria-busy={pending}>
    <span>{pending ? "검색 중" : "검색"}</span>
    {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
  </button>;
}
