import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { maxSearchPage, searchHref, searchPageNumbers, type SearchOptions } from "@/lib/company-search-options";

export function SearchPagination({ query, options, totalPages }: { query: string; options: SearchOptions; totalPages: number }) {
  if (totalPages <= 1 && options.page === 1) return null;
  const last = Math.min(totalPages, maxSearchPage);
  const href = (page: number) => searchHref(query, { ...options, page });
  return <nav className="search-pagination" aria-label="검색 결과 페이지">
    {options.page > 1 ? <Link className="page-previous" href={href(Math.max(1, Math.min(options.page - 1, last)))} prefetch={false}>
      <ChevronLeft size={18} aria-hidden="true" />이전</Link>
      : <span className="page-previous" aria-disabled="true"><ChevronLeft size={18} aria-hidden="true" />이전</span>}
    <div className="page-numbers">{searchPageNumbers(options.page, totalPages).map((value, i) => value === "ellipsis"
      ? <span className="page-ellipsis" key={`gap-${i}`} aria-hidden="true">...</span>
      : value === options.page ? <strong key={value} aria-current="page" aria-label={`${value}페이지`}>{value}</strong>
      : <Link key={value} href={href(value)} prefetch={false} aria-label={`${value}페이지`}>{value}</Link>)}</div>
    {options.page < last ? <Link className="page-next" href={href(options.page + 1)} prefetch={false}>
      다음<ChevronRight size={18} aria-hidden="true" /></Link>
      : <span className="page-next" aria-disabled="true">다음<ChevronRight size={18} aria-hidden="true" /></span>}
  </nav>;
}
