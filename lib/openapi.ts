import { apiMetadata } from "@/lib/company-api";
import { maxSearchPage, regions } from "@/lib/company-search-options";

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const text = (description: string, nullable = false) => ({ type: "string", description, nullable });
const number = (description: string, nullable = true) => ({ type: "number", description, nullable });
const integer = (description: string, nullable = true) => ({ type: "integer", description, nullable });
const object = (properties: Record<string, unknown>) => ({ type: "object", required: Object.keys(properties), additionalProperties: false, properties });
const month = { type: "string", pattern: "^[1-9][0-9]{3}-(0[1-9]|1[0-2])$", example: "2026-08" };
const summaryProperties = {
  id: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, name: text("공개된 사업장명"),
  industry: text("업종명", true), address: text("대표 주소", true), snapshotMonth: { ...month, nullable: true },
  employeeCount: integer("국민연금 가입자 수(명). 실제 재직자 수와 다를 수 있습니다."),
  estimatedAverageAnnualSalary: integer("국민연금 기반 추정 연봉(원). 반올림한 월 추정치의 12배입니다."),
  newJoiners: integer("해당 월 신규취득자 수(명). 실제 입사자 수가 아닙니다."),
  departures: integer("해당 월 자격상실자 수(명). 실제 퇴사자 수가 아닙니다."),
  netSubscribers: integer("신규취득 - 자격상실(명). 전월 대비 가입자 변화와 다릅니다."),
  detailPath: text("동일 서비스의 상세 화면 상대 경로. 확정되지 않은 도메인을 포함하지 않습니다.")
};
const benchmarkProperties = {
  employeeTopPercent: number("전국 가입자 규모 상위 백분율. 동률 포함, 작을수록 상위.", false),
  salaryTopPercent: number("전국 추정 연봉 상위 백분율. 동률 포함."),
  industryEmployeeTopPercent: number("동일 업종 가입자 규모 상위 백분율. 업종 미상/표본 30 미만이면 null."),
  industrySalaryTopPercent: number("동일 업종 추정 연봉 상위 백분율. 업종 미상/유효 표본 30 미만이면 null."),
  employeeSampleCount: integer("전국 규모 비교 표본 수", false), salarySampleCount: integer("전국 급여 비교 표본 수", false),
  industryEmployeeSampleCount: integer("동일 업종 규모 표본 수", false), industrySalarySampleCount: integer("동일 업종 급여 표본 수", false)
};
const pagination = { limit: integer("요청한 최대 반환 수", false), returnedCount: integer("실제 반환 수", false),
  hasMore: { type: "boolean", description: "조건에 맞는 추가 결과 존재 여부. 전체 건수는 계산하지 않습니다." } };
const envelope = (name: string) => object({ data: ref(name), meta: ref("Metadata") });
const errors = {
  "400": { description: "입력 형식, 범위, 중복 또는 미지원 매개변수 오류", content: { "application/json": { schema: ref("Error") } } },
  "500": { description: "내부 조회 실패. 내부 경로와 SQL은 응답에 포함하지 않습니다.", content: { "application/json": { schema: ref("Error") } } }
};
const notFound = { "404": { description: "존재하지 않는 회사 ID", content: { "application/json": { schema: ref("Error") } } } };
const success = (name: string) => ({ description: "성공. Cache-Control: public, max-age=60", content: { "application/json": { schema: ref(name) } } });
const id = { name: "id", in: "path", required: true, schema: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER }, example: 177744 };

export const openApiDocument = {
  openapi: "3.0.3",
  info: { title: "Company Lens API", version: "1.1.0",
    description: "국민연금 공개 사업장 데이터의 읽기 전용 API. 인증 없음. 금액은 원(KRW), 인원은 명, 기준월은 YYYY-MM입니다. 누락 값은 null이며 0으로 대체하지 않습니다. 중복/미지원 쿼리 매개변수는 400입니다. 웹 화면과 같은 로컬 DB를 사용하며 외부 데이터 API를 호출하지 않습니다." },
  servers: [{ url: "/", description: "명세를 제공하는 동일 서비스. LAN/공개 도메인 공통." }],
  security: [],
  tags: [{ name: "Companies", description: "회사 검색, 최신 지표 및 월별 이력" }, { name: "Dataset", description: "적재 상태" }],
  paths: {
    "/api/v1/companies": { get: { tags: ["Companies"], operationId: "searchCompanies", summary: "회사 검색",
      description: "회사명 또는 공개된 사업자등록번호 부분 검색. q는 trim 후 3~100자이며 글자/숫자를 포함해야 합니다. %, _, 제어문자는 금지합니다. 번호 검색은 공백/하이픈 제거 후에도 3자리 이상이어야 합니다. 지역·가입자 규모 필터 후 정렬·페이지 이동을 적용합니다. 동일 조건과 limit으로 page를 증가시키세요. 전체 건수는 계산하지 않습니다. 최대 페이지에 도달하면 조건을 좁히세요. 지역은 대표 주소 기준이며 강원도·전라북도 표기도 포함합니다.",
      parameters: [{ name: "q", in: "query", required: true, schema: { type: "string", minLength: 3, maxLength: 100 }, example: "삼성전자" },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 20, default: 5 } },
        { name: "page", in: "query", schema: { type: "integer", minimum: 1, maximum: maxSearchPage, default: 1 } },
        { name: "region", in: "query", schema: { type: "string", enum: ["", ...regions], default: "" }, description: "생략/빈 값은 전체 지역" },
        { name: "minEmployees", in: "query", schema: { type: "integer", minimum: 1, maximum: 10000000 }, description: "최소 국민연금 가입자 수. 생략/빈 값은 제한 없음" },
        { name: "sort", in: "query", schema: { type: "string", enum: ["relevance", "employees"], default: "relevance" } }],
      responses: { "200": success("SearchResponse"), ...errors } } },
    "/api/v1/companies/{id}": { get: { tags: ["Companies"], operationId: "getCompany", summary: "최신 회사 지표",
      description: "전월 비교는 바로 이전 달 데이터가 있을 때만 제공합니다. 연봉 변화율은 이전 값이 0이면 null. 상위 백분율은 최신 통계월의 가입 중인 유효 사업장에만 있으며 과거월 회사는 benchmark=null입니다. 비교 표본은 법인이 아닌 사업장입니다.",
      parameters: [id], responses: { "200": success("DetailResponse"), ...errors, ...notFound } } },
    "/api/v1/companies/{id}/history": { get: { tags: ["Companies"], operationId: "getCompanyHistory", summary: "월별 회사 이력",
      description: "기준월 오름차순, 범위 양끝 포함. 누락된 달은 생성하지 않습니다. 기본/최대 240개. hasMore=true이면 마지막 반환 기준월의 다음 달을 from으로 지정하여 이어서 조회하세요. 범위 내 이력이 없어도 존재하는 회사면 빈 배열과 200입니다.",
      parameters: [id, { name: "from", in: "query", schema: month }, { name: "to", in: "query", schema: month },
        { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 240, default: 240 } }],
      responses: { "200": success("HistoryResponse"), ...errors, ...notFound } } },
    "/api/v1/status": { get: { tags: ["Dataset"], operationId: "getDatasetStatus", summary: "최신 적재 정보",
      responses: { "200": success("StatusResponse"), ...errors } } }
  },
  components: { schemas: {
    Metadata: { ...object({ source: text("데이터 제공 기관"), sourceUrl: { type: "string", format: "uri" },
      salaryBasis: text("반드시 사용자에게 표시할 추정치 안내"), currency: { type: "string", enum: ["KRW"] }, caveat: text("사업장 단위 및 해석 주의사항") }), example: apiMetadata },
    CompanySummary: object(summaryProperties),
    CompanyDetail: object({ ...summaryProperties, registrationNumber: text("원본 공개 번호. 마스킹/부분 공개 가능.", true),
      roadAddress: text("도로명주소", true), lotAddress: text("지번주소", true),
      estimatedAverageMonthlySalary: integer("국민연금 기반 추정 월급(원). 기준월 보험료율 적용."),
      monthlyBilledAmount: integer("당월고지금액(원)"),
      comparison: object({ previousSnapshotMonth: { ...month, nullable: true }, employeeCountDelta: integer("바로 이전 달 대비 가입자 수 차이(명)"),
        annualSalaryChangePercent: number("바로 이전 달 대비 추정 연봉 변화율(%). 반올림하지 않은 수치.") }),
      benchmark: { ...object(benchmarkProperties), nullable: true } }),
    Snapshot: object({ snapshotMonth: month, employeeCount: summaryProperties.employeeCount,
      estimatedAverageAnnualSalary: summaryProperties.estimatedAverageAnnualSalary,
      newJoiners: summaryProperties.newJoiners, departures: summaryProperties.departures, netSubscribers: summaryProperties.netSubscribers }),
    SearchData: object({ query: text("정리된 검색어"), ...pagination,
      page: { type: "integer", minimum: 1, maximum: maxSearchPage },
      region: { type: "string", enum: ["", ...regions] }, minEmployees: { type: "integer", nullable: true, minimum: 1, maximum: 10000000 },
      sort: { type: "string", enum: ["relevance", "employees"] },
      companies: { type: "array", maxItems: 20, items: ref("CompanySummary") } }),
    HistoryData: object({ companyId: { type: "integer", minimum: 1 }, companyName: text("사업장명"),
      from: { ...month, nullable: true }, to: { ...month, nullable: true }, order: { type: "string", enum: ["asc"] }, ...pagination,
      snapshots: { type: "array", maxItems: 240, items: ref("Snapshot") } }),
    StatusData: object({ latestSnapshotMonth: { ...month, nullable: true }, latestSourceRowCount: integer("최신 원본 파일의 행 수. 전체 회사 수/히스토리 행 수가 아닙니다."),
      importedAt: text("최신 파일의 적재 시각(ISO 8601)", true) }),
    SearchResponse: envelope("SearchData"), DetailResponse: envelope("CompanyDetail"),
    HistoryResponse: envelope("HistoryData"), StatusResponse: envelope("StatusData"),
    Error: object({ error: object({ code: { type: "string", enum: ["INVALID_REQUEST", "COMPANY_NOT_FOUND", "INTERNAL_ERROR"] }, message: text("오류 설명") }) })
  } }
};
