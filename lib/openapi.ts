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
  hasMore: { type: "boolean", description: "조건에 맞는 추가 결과 존재 여부." } };
const employmentProperties = {
  snapshotMonth: { ...month, nullable: true }, yearAgoMonth: { ...month, nullable: true },
  employeeDelta: integer("정확히 12개월 전 대비 가입자 차이. 해당 월/인원이 없으면 null."),
  employeeChangePercent: number("12개월 전 대비 가입자 변화율. 이전 값 0이면 null."),
  annualSalaryChangePercent: number("12개월 전 대비 국민연금 기반 추정 연봉 변화율."),
  threeYearsAgoMonth: { ...month, nullable: true },
  threeYearsAgoEmployeeCount: integer("정확히 36개월 전 가입자 수"), latestEmployeeCount: integer("최신 가입자 수"),
  threeYearEmployeeDelta: integer("36개월 전 대비 가입자 차이. 누락 시 null."),
  threeYearEmployeeChangePercent: number("36개월 전 대비 가입자 변화율. 이전 값 0이면 null."),
  twelveMonthNewJoiners: integer("최신 월 포함 12개월 신규취득 합계. 누락 월/값이 있으면 null. 고유 인원이 아님."),
  twelveMonthDepartures: integer("최신 월 포함 12개월 자격상실 합계. 누락 월/값이 있으면 null. 실제 퇴사자 수가 아님."),
  movementMonths: integer("최근 12개월 중 관측 월 수. 해당 항목 값의 완전성을 뜻하지 않습니다.", false),
  recentThreeMonthChangePercent: number("최근 4개 월의 인원 자료가 모두 있을 때 3개월 전 대비 변화율."),
  consecutiveMonths: integer("최신 월까지 같은 방향으로 이어진 전월 비교 횟수. 누락 월/인원에서 중단.", false),
  direction: { type: "string", nullable: true, enum: ["up", "down", "flat", null] }
};
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
  info: { title: "Company Lens API", version: "1.5.0",
    description: "국민연금 공개 사업장 데이터의 읽기 전용 API. 인증 없음. 금액은 원(KRW), 인원은 명, 기준월은 YYYY-MM입니다. 누락 값은 null이며 0으로 대체하지 않습니다. 중복/미지원 쿼리 매개변수는 400입니다. 웹 화면과 같은 로컬 DB를 사용하며 외부 데이터 API를 호출하지 않습니다." },
  servers: [{ url: "/", description: "명세를 제공하는 동일 서비스. LAN/공개 도메인 공통." }],
  security: [],
  tags: [{ name: "Companies", description: "회사 검색, 최신 지표 및 월별 이력" }, { name: "Dataset", description: "적재 상태" }],
  paths: {
    "/api/v1/compare": { get: { tags: ["Companies"], operationId: "compareCompanies", summary: "2~3개 사업장 비교",
      description: "각 사업장 최신 기준월을 그대로 반환합니다. sameSnapshotMonth=false이면 같은 시점의 비교가 아닙니다. ID 하나라도 존재하지 않으면 전체 요청이 404입니다.",
      parameters: [{ name: "ids", in: "query", required: true, schema: { type: "string", pattern: "^[1-9][0-9]*(,[1-9][0-9]*){1,2}$" }, example: "177744,177745", description: "서로 다른 양의 안전 정수 ID 2~3개를 쉼표로 구분. 공백/중복 불가." }],
      responses: { "200": success("ComparisonResponse"), ...errors, ...notFound } } },
    "/api/v1/companies/{id}/insights": { get: { tags: ["Companies"], operationId: "getCompanyInsights", summary: "고용 요약, 업종 중간값과 명칭 관측",
      description: "1년/3년 전 같은 달 대비 증감, 최근 12개월 취득·상실 합계, 최신 13개월 안의 연속 변화와 업종·규모 중간값을 반환합니다. 유사 이름은 동일 법인이나 계열사로 확인된 관계가 아닙니다. 명칭은 기능 도입 이후 관측값이며 과거 명칭을 복원하지 않습니다. 업종/규모 표본 30 미만 또는 과거월 사업장은 industry/sizeCohort=null입니다. 규모는 최신 가입자 기준 고정 구간이며 기업 규모 법적 분류가 아닙니다.",
      parameters: [id], responses: { "200": success("InsightsResponse"), ...errors, ...notFound } } },
    "/api/v1/companies": { get: { tags: ["Companies"], operationId: "searchCompanies", summary: "회사 검색",
      description: "일용 표기 사업장의 마지막 가입자가 0명이거나, 유효한 관측 월이 한 달뿐이고 0명이면 기준월과 관계없이 제외합니다. 대체된 원본 버전은 별도 관측으로 세지 않습니다. 양수·미상 인원은 유지합니다. 필터 적용 전 이름/번호 후보가 20,000개를 넘으면 400 INVALID_REQUEST를 반환합니다. 회사명이나 번호를 더 구체적으로 입력하세요. " +
        "회사명 또는 공개된 사업자등록번호 부분 검색. 최신 적재 기준월보다 12개월 이상 오래됐고 마지막 가입자가 0명인 기록은 제외합니다. 직접 상세·이력은 유지하며 폐업 판정은 아닙니다. q는 trim 후 3~100자이며 글자/숫자를 포함해야 합니다. %, _, 제어문자는 금지합니다. 번호 검색은 공백/하이픈 제거 후에도 3자리 이상이어야 합니다. 지역·가입자 규모 필터 후 전체 건수(totalCount)와 전체 페이지 수(totalPages)를 집계하고 정렬·페이지 이동을 적용합니다. 동일 조건과 limit을 유지하세요. 결과가 없으면 totalPages=0이며 유효하지만 범위를 벗어난 page는 빈 목록을 반환합니다. 최대 요청 페이지는 1000이며 totalPages가 이를 넘어도 이 상한은 유지됩니다. 지역은 대표 주소 기준이며 강원도·전라북도 표기도 포함합니다.",
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
    EmploymentInsight: object(employmentProperties),
    IndustryComparison: object({ snapshotMonth: month, employeeSampleCount: integer("업종의 유효 가입자 표본 수", false),
      salarySampleCount: integer("업종의 양수 급여 표본 수", false), medianEmployeeCount: number("업종 가입자 중간값. 짝수 표본이면 중앙 두 값의 평균.", false),
      medianAnnualSalary: number("업종 국민연금 기반 추정 연봉 중간값(원). 급여 표본 30 미만이면 null.") }),
    ObservedName: object({ name: text("원본에서 관측한 사업장명"), firstSeenMonth: month, lastSeenMonth: month }),
    InsightsData: object({ companyId: { type: "integer", minimum: 1 }, employment: ref("EmploymentInsight"),
      sizeCohort: { ...object({ snapshotMonth: month, sizeBand: { type: "integer", minimum: 0, maximum: 4,
        description: "최신 가입자 수 구간: 0=1~9, 1=10~49, 2=50~299, 3=300~999, 4=1000 이상" },
        employeeSampleCount: integer("최신 동일 업종·규모 표본 수. 해당 사업장 포함.", false),
        salarySampleCount: integer("양수 급여 표본 수", false), growthSampleCount: integer("1년 전 동일 식별키의 활성 가입자 자료가 있는 표본 수", false),
        medianAnnualSalary: number("국민연금 기반 추정 연봉 중간값(원). 유효 표본 30 미만 null."),
        medianEmployeeChangePercent: number("1년 가입자 증감률 중간값(%). 유효 표본 30 미만 null.") }), nullable: true },
      industry: { ...object({ snapshotMonth: month, employeeSampleCount: integer("가입자 표본", false), salarySampleCount: integer("급여 표본", false),
        medianEmployeeCount: number("가입자 중간값", false), medianAnnualSalary: number("국민연금 기반 추정 연봉 중간값(원)") }), nullable: true },
      recordCandidates: { type: "array", maxItems: 6, description: "공개 번호·주소 일치, 유사 이름, 맞닿는 관측 월 기준 후보. 동일 사업장 확정이나 이력 통합이 아닙니다.", items: object({
        id: { type: "integer", minimum: 1 }, name: text("후보 사업장명"), firstMonth: month, lastMonth: month,
        direction: { type: "string", enum: ["earlier", "later"], description: "현재 사업장 관측 기간보다 이전 또는 이후의 기록 후보. 동일 법인 확정 아님." }
      }) },
      observedNames: { type: "array", maxItems: 30, items: ref("ObservedName") }, relatedQuery: text("유사 이름 후보 검색어. 3자 미만은 null.", true),
      relatedCandidates: { type: "array", maxItems: 6, items: ref("CompanySummary") }, identityCaveat: text("명칭 관측/관계 추정에 대한 주의사항") }),
    ComparisonData: object({ sameSnapshotMonth: { type: "boolean" }, companies: { type: "array", minItems: 2, maxItems: 3,
      items: object({ ...summaryProperties, employment: ref("EmploymentInsight"), benchmark: { ...object(benchmarkProperties), nullable: true } }) } }),
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
      totalCount: { type: "integer", minimum: 0, description: "제외 조건과 지역·가입자 규모 필터를 적용한 전체 검색 결과 수." },
      totalPages: { type: "integer", minimum: 0, description: "totalCount / limit 올림. 결과가 없으면 0. 요청 가능한 page 상한은 1000." },
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
    ComparisonResponse: envelope("ComparisonData"), InsightsResponse: envelope("InsightsData"),
    HistoryResponse: envelope("HistoryData"), StatusResponse: envelope("StatusData"),
    Error: object({ error: object({ code: { type: "string", enum: ["INVALID_REQUEST", "COMPANY_NOT_FOUND", "INTERNAL_ERROR"] }, message: text("오류 설명") }) })
  } }
};
