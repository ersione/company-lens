import { getCompanyBenchmark, getCompanyDetail, getCompanyHistory, getDatasetStatus, searchCompanyPage, getIndustryComparison, getSizeCohortComparison, getCompanyNames } from "@/lib/company-queries";
import { getCompanyRecordCandidates } from "@/lib/company-queries";
import { searchCompanySuggestions } from "@/lib/company-queries";
import { SearchTooBroadError } from "@/lib/company-search-guard";
import type { CompanySearchResult } from "@/lib/company-queries";
import { netSubscribers, percentageChange, previousMonthSnapshot } from "@/lib/company-metrics";
import { validateCompanySearch } from "@/lib/company-search-input";
import { parseSearchOptions } from "@/lib/company-search-options";
import { employmentInsight, monthOffset, parseComparisonIds, relatedNameQuery } from "@/lib/company-insights";

export const apiMetadata = {
  source: "국민연금공단",
  sourceUrl: "https://www.data.go.kr/data/15083277/fileData.do",
  salaryBasis: "국민연금 기반 추정치",
  currency: "KRW",
  caveat: "공개된 사업장 단위 정보입니다. 실제 급여·재직 인원 및 입·퇴사와 다를 수 있으며, 사업자등록번호가 일부만 공개될 수 있습니다."
};

class ApiInputError extends Error {}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: {
    "Cache-Control": status === 200 ? "public, max-age=60" : "no-store",
    "X-Content-Type-Options": "nosniff"
  } });
}

export function apiResponse(action: () => unknown) {
  try {
    return json({ data: action(), meta: apiMetadata });
  } catch (error) {
    if (error instanceof ApiInputError || error instanceof SearchTooBroadError) return json({ error: { code: "INVALID_REQUEST", message: error.message } }, 400);
    if (error instanceof CompanyNotFound) return json({ error: { code: "COMPANY_NOT_FOUND", message: "회사를 찾을 수 없습니다." } }, 404);
    console.error("Company Lens API failed", error);
    return json({ error: { code: "INTERNAL_ERROR", message: "데이터를 조회하지 못했습니다. 잠시 후 다시 시도하세요." } }, 500);
  }
}

class CompanyNotFound extends Error {}

function parameters(request: Request, allowed: string[]) {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (!allowed.includes(key) || params.getAll(key).length !== 1) {
      throw new ApiInputError(`지원하지 않거나 중복된 매개변수입니다: ${key}`);
    }
  }
  return params;
}

function positiveInteger(value: string, name: string, max: number) {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
    throw new ApiInputError(`${name}: 1~${max} 사이의 정수를 입력하세요.`);
  }
  return Number(value);
}

export function companyId(value: string) {
  return positiveInteger(value, "id", Number.MAX_SAFE_INTEGER);
}

function month(value: string | null, name: string) {
  if (value === null) return undefined;
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)) throw new ApiInputError(`${name}: YYYY-MM 형식의 기준월을 입력하세요.`);
  return value;
}

function summary(company: CompanySearchResult) {
  return { id: company.id, name: company.name, industry: company.industry, address: company.address,
    snapshotMonth: company.snapshotMonth, employeeCount: company.employeeCount,
    estimatedAverageAnnualSalary: company.estimatedAverageAnnualSalary,
    newJoiners: company.newJoiners, departures: company.departures,
    netSubscribers: netSubscribers(company.newJoiners, company.departures),
    detailPath: `/companies/${company.id}` };
}

export function searchApi(request: Request) {
  const params = parameters(request, ["q", "limit", "region", "minEmployees", "sort", "page"]);
  const { query, error } = validateCompanySearch(params.get("q") ?? undefined);
  if (error) throw new ApiInputError(`q: ${error}`);
  const limit = positiveInteger(params.get("limit") ?? "5", "limit", 20);
  const parsed = parseSearchOptions(Object.fromEntries(params));
  if (parsed.error) throw new ApiInputError(parsed.error);
  const { results, hasMore, totalCount, totalPages } = searchCompanyPage(query, parsed.options, limit);
  return { query, limit, ...parsed.options, returnedCount: results.length, hasMore, totalCount, totalPages,
    companies: results.map(summary) };
}

export function detailApi(request: Request, rawId: string) {
  parameters(request, []);
  const id = companyId(rawId);
  const company = getCompanyDetail(id);
  if (!company) throw new CompanyNotFound();
  // Only the immediately preceding calendar month is used for comparisons.
  const from = company.snapshotMonth ? previousCalendarMonth(company.snapshotMonth) : undefined;
  const history = company.snapshotMonth ? getCompanyHistory(id, { from, to: company.snapshotMonth, limit: 2 }) : [];
  const previous = previousMonthSnapshot(history, company.snapshotMonth);
  return { ...summary(company), registrationNumber: company.registrationNumber,
    roadAddress: company.roadAddress, lotAddress: company.lotAddress,
    estimatedAverageMonthlySalary: company.estimatedAverageMonthlySalary,
    monthlyBilledAmount: company.monthlyBilledAmount,
    comparison: { previousSnapshotMonth: previous?.snapshotMonth ?? null,
      employeeCountDelta: company.employeeCount !== null && previous?.employeeCount != null
        ? company.employeeCount - previous.employeeCount : null,
      annualSalaryChangePercent: percentageChange(company.estimatedAverageAnnualSalary, previous?.estimatedAverageAnnualSalary) },
    benchmark: getCompanyBenchmark(id, company.snapshotMonth) ?? null };
}

function previousCalendarMonth(value: string) {
  const [year, number] = value.split("-").map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
}

export function historyApi(request: Request, rawId: string) {
  const params = parameters(request, ["from", "to", "limit"]);
  const id = companyId(rawId);
  const from = month(params.get("from"), "from");
  const to = month(params.get("to"), "to");
  if (from && to && from > to) throw new ApiInputError("from은 to보다 늦을 수 없습니다.");
  const limit = positiveInteger(params.get("limit") ?? "240", "limit", 240);
  const company = getCompanyDetail(id);
  if (!company) throw new CompanyNotFound();
  const rows = getCompanyHistory(id, { from, to, limit: limit + 1 });
  return { companyId: id, companyName: company.name, from: from ?? null, to: to ?? null,
    order: "asc", limit, returnedCount: Math.min(rows.length, limit), hasMore: rows.length > limit,
    snapshots: rows.slice(0, limit).map((row) => ({ ...row, netSubscribers: netSubscribers(row.newJoiners, row.departures) })) };
}

export function statusApi(request: Request) {
  parameters(request, []);
  const dataset = getDatasetStatus();
  return { latestSnapshotMonth: dataset?.snapshotMonth ?? null,
    latestSourceRowCount: dataset?.rowCount ?? null, importedAt: dataset?.importedAt ?? null };
}

export function insightsApi(request: Request, rawId: string) {
  parameters(request, []);
  const id = companyId(rawId);
  const company = getCompanyDetail(id);
  if (!company) throw new CompanyNotFound();
  const history = company.snapshotMonth ? getCompanyHistory(id, {
    from: monthOffset(company.snapshotMonth, -36), to: company.snapshotMonth
  }) : [];
  const query = relatedNameQuery(company.name);
  return { companyId: id, employment: employmentInsight(history), industry: getIndustryComparison(id) ?? null,
    sizeCohort: getSizeCohortComparison(id) ?? null,
    observedNames: getCompanyNames(id), relatedQuery: query,
    recordCandidates: getCompanyRecordCandidates(id),
    relatedCandidates: query ? searchCompanySuggestions(query, 7).filter((row) => row.id !== id).slice(0, 6).map(summary) : [],
    identityCaveat: "유사 이름은 동일 법인·계열사라는 뜻이 아닙니다. 명칭은 수집 관측값이며 법적 변경 이력이 아닙니다. 기존 적재분의 과거 명칭은 복원하지 않습니다." };
}

export function comparisonApi(request: Request) {
  const params = parameters(request, ["ids"]);
  const { ids, error } = parseComparisonIds(params.get("ids") ?? undefined, 2);
  if (error) throw new ApiInputError(error);
  const companies = ids.map((id) => {
    const company = getCompanyDetail(id);
    if (!company) throw new CompanyNotFound();
    return { ...summary(company), employment: employmentInsight(company.snapshotMonth ? getCompanyHistory(id, {
      from: monthOffset(company.snapshotMonth, -36), to: company.snapshotMonth
    }) : []), benchmark: getCompanyBenchmark(id, company.snapshotMonth) ?? null };
  });
  return { companies, sameSnapshotMonth: new Set(companies.map((row) => row.snapshotMonth)).size === 1 };
}
