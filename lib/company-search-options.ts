export const regions = ["서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시", "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도"] as const;
export const regionLabels = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"] as const;
export const maxSearchPage = 1000;
export type SearchOptions = { page: number; region: string; minEmployees: number | null; sort: "relevance" | "employees"; includeHistory: boolean };
export const defaultSearchOptions: SearchOptions = { page: 1, region: "", minEmployees: null, sort: "employees", includeHistory: false };

export function searchPageNumbers(page: number, totalPages: number): (number | "ellipsis")[] {
  const last = Math.min(totalPages, maxSearchPage);
  if (last <= 0) return [];
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const current = Math.min(page, last);
  const start = Math.max(1, Math.min(current - 1, last - 2));
  const end = Math.min(last, Math.max(current + 1, 3));
  const pages = [...new Set([1, ...Array.from({ length: end - start + 1 }, (_, i) => start + i), last])].sort((a,b) => a-b);
  return pages.flatMap((value, i): (number | "ellipsis")[] => i && value - pages[i-1] > 1 ? ["ellipsis", value] : [value]);
}

export function parseSearchOptions(params: Record<string, string | string[] | undefined>) {
  const options = { ...defaultSearchOptions };
  for (const key of ["page", "region", "minEmployees", "sort", "includeHistory"] as const) {
    const raw = params[key];
    if (Array.isArray(raw)) return { options, error: `${key}: 중복된 검색 조건입니다.` };
    if (raw === undefined || (raw === "" && (key === "region" || key === "minEmployees"))) continue;
    if (key === "includeHistory") {
      if (raw !== "true" && raw !== "false") return { options, error: "과거 사업장 포함: true 또는 false를 입력하세요." };
      options.includeHistory = raw === "true";
    } else if (key === "region") {
      if (!(regions as readonly string[]).includes(raw)) return { options, error: "지역: 지원하는 시·도를 선택하세요." };
      options.region = raw;
    } else if (key === "sort") {
      if (raw !== "relevance" && raw !== "employees") return { options, error: "정렬: 관련도순 또는 가입자 수순을 선택하세요." };
      options.sort = raw;
    } else {
      const max = key === "page" ? maxSearchPage : 10000000;
      if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) {
        return { options, error: `${key}: 1~${max} 사이의 정수를 입력하세요.` };
      }
      options[key] = Number(raw);
    }
  }
  return { options, error: null };
}

export function regionPrefixes(region: string) {
  if (region === "강원특별자치도") return [region, "강원도"];
  if (region === "전북특별자치도") return [region, "전라북도"];
  return region ? [region] : [];
}

export function searchHref(query: string, options: SearchOptions) {
  const params = new URLSearchParams({ q: query });
  if (options.region) params.set("region", options.region);
  if (options.minEmployees !== null) params.set("minEmployees", String(options.minEmployees));
  if (options.sort !== defaultSearchOptions.sort) params.set("sort", options.sort);
  if (options.includeHistory) params.set("includeHistory", "true");
  if (options.page > 1) params.set("page", String(options.page));
  return `/?${params}`;
}
