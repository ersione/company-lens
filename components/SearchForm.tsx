"use client";

import Form from "next/form";
import { Button, Checkbox, Input, Select } from "@ersione/design-system/react";
import { useFormStatus } from "react-dom";
import { useState } from "react";
import { ArrowRight, LoaderCircle, Search, MapPin, Users, ArrowDownWideNarrow, RotateCcw } from "lucide-react";
import { regions, regionLabels, defaultSearchOptions, type SearchOptions } from "@/lib/company-search-options";

export function SearchForm({ query, error, options = defaultSearchOptions }: { query: string; error?: string | null; options?: SearchOptions }) {
  const [draft, setDraft] = useState(options);
  const sizes = [10, 50, 100, 300, 500, 1000];
  if (options.minEmployees !== null && !sizes.includes(options.minEmployees)) sizes.push(options.minEmployees);
  const filtered = draft.region || draft.minEmployees !== null || draft.sort !== defaultSearchOptions.sort || draft.includeHistory;
  return (
    <Form action="/" className="company-search-form" role="search">
      <div className="search-form">
        <Search className="search-input-icon" size={22} aria-hidden="true" />
        <Input
          controlSize="lg"
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
          <Select name="region" aria-label="지역" value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.currentTarget.value })}>
            <option value="">전체 지역</option>{regions.map((region, index) => <option key={region} value={region}>{regionLabels[index]}</option>)}
          </Select>
        </label>
        <label><span><Users size={15} aria-hidden="true" />가입자 규모</span>
          <Select name="minEmployees" aria-label="가입자 규모" value={draft.minEmployees ?? ""} onChange={(event) => setDraft({ ...draft, minEmployees: event.currentTarget.value ? Number(event.currentTarget.value) : null })}>
            <option value="">전체 규모</option>{sizes.sort((a, b) => a - b).map((size) => <option key={size} value={size}>{size.toLocaleString("ko-KR")}명 이상</option>)}
          </Select>
        </label>
        <label><span><ArrowDownWideNarrow size={15} aria-hidden="true" />정렬</span>
          <Select name="sort" aria-label="정렬" value={draft.sort} onChange={(event) => setDraft({ ...draft, sort: event.currentTarget.value as SearchOptions["sort"] })}>
            <option value="employees">가입자 수순</option><option value="relevance">관련도순</option>
          </Select>
        </label>
        <label className="history-filter">
          <Checkbox name="includeHistory" value="true" checked={draft.includeHistory}
            onChange={(event) => setDraft({ ...draft, includeHistory: event.currentTarget.checked })} />
          <span>과거 사업장 포함</span>
        </label>
        {filtered && <button type="button" className="filter-reset" onClick={() => setDraft(defaultSearchOptions)}><RotateCcw size={15} aria-hidden="true" />초기화</button>}
      </div>
    </Form>
  );
}

function SearchButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" size="lg" loading={pending} aria-label="검색" aria-busy={pending}>
    <span>{pending ? "검색 중" : "검색"}</span>
    {pending ? <LoaderCircle className="spin" size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}
  </Button>;
}
