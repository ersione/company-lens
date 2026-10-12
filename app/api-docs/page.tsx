import Link from "next/link";
import { ArrowLeft, FileJson, ExternalLink } from "lucide-react";
import { openApiDocument } from "@/lib/openapi";

export const metadata = { title: "API 문서 | Company Lens" };

export default function ApiDocsPage() {
  return <main className="page-shell api-docs-page">
    <Link href="/" className="back-link"><ArrowLeft size={16} aria-hidden="true" />회사 검색</Link>
    <header className="api-docs-heading"><div><p className="eyebrow">DEVELOPER API · v1</p><h1>Company Lens API</h1>
      <p>국민연금 사업장 데이터 · 인증 없는 읽기 전용 API</p></div>
      <a href="/api/openapi.json" className="back-link"><FileJson size={18} aria-hidden="true" />OpenAPI JSON<ExternalLink size={14} aria-hidden="true" /></a></header>
    <section className="api-docs-conventions"><h2>응답 기준</h2><p>금액은 원(KRW), 인원은 명, 기준월은 YYYY-MM입니다. 누락 값은 <code>null</code>이며 0과 구분합니다.
      성공 응답은 <code>{'{ data, meta }'}</code>, 실패 응답은 <code>{'{ error: { code, message } }'}</code> 구조입니다.</p>
      <p>급여는 국민연금 기반 추정치입니다. 사업장 단위 정보로 실제 급여·재직 인원 및 입·퇴사와 다를 수 있습니다.</p></section>
    {Object.entries(openApiDocument.paths).map(([path, { get }]) => <section key={path} className="api-docs-endpoint">
      <h2><span>GET</span><code>{path}</code></h2><h3>{get.summary}</h3>
      {"description" in get && <p>{get.description}</p>}
      {"parameters" in get && <div className="history-table"><table><thead><tr><th>매개변수</th><th>위치</th><th>필수</th></tr></thead>
        <tbody>{get.parameters.map((parameter) => <tr key={parameter.name}><td><code>{parameter.name}</code></td><td>{parameter.in}</td><td>{"required" in parameter && parameter.required ? "필수" : "선택"}</td></tr>)}</tbody></table></div>}
    </section>)}
    <section className="api-docs-endpoint"><h2>호출 예제</h2><pre><code>{`curl -G "$COMPANY_LENS_URL/api/v1/companies" \\\n  --data-urlencode "q=삼성전자" --data "limit=5"\n\ncurl "$COMPANY_LENS_URL/api/v1/companies/177744"\n\ncurl "$COMPANY_LENS_URL/api/v1/companies/177744/history?from=2025-01&to=2026-08"`}</code></pre>
      <p><code>COMPANY_LENS_URL</code>은 접속 중인 서비스의 주소입니다. 검색은 2~100자, 최대 20개(기본 5개), 이력은 최대 240개입니다.</p>
      <p>기본 검색은 최신 적재월의 사업장만 반환합니다. 과거 기록은 <code>includeHistory=true</code>로 포함하며, 최신 자료에 없다는 것이 폐업을 뜻하지는 않습니다.</p>
      <p>지역·최소 가입자 수·정렬·과거 포함 조건을 유지한 채 <code>page</code>를 증가시켜 조회합니다. <code>totalCount</code>와 <code>totalPages</code>는 필터 적용 후 전체 건수와 페이지 수이며, <code>hasMore</code>는 다음 결과 여부입니다. 조건 변경 시 첫 페이지로 돌아가세요.</p></section>
    <section className="api-docs-endpoint"><h2>오류와 연동</h2><p>400: 입력 오류 · 404: 회사 없음 · 500: 조회 실패. 중복되거나 지원하지 않는 쿼리 매개변수도 400입니다.</p>
      <p>서버 간 호출용이며 별도 CORS 허용은 없습니다. 성공 데이터는 60초 캐시 가능하고 오류는 캐시하지 않습니다. 카카오톡 응답에도 기준월·추정치 안내를 함께 표시하세요.</p></section>
  </main>;
}
