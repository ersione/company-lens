# Company Lens

국민연금 공개 데이터로 회사의 가입자 수, 추정 급여와 고용 변화를 살펴보는 웹 서비스입니다.

![Node.js 22 이상](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
[![MIT License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

**[서비스 바로가기](https://companylens.ersione.com)** · [API 문서](https://companylens.ersione.com/api-docs) · 한국어 · [English](README.en.md)

[주요 기능](#주요-기능) · [설치](#설치) · [사용법](#사용법) · [개발과-설정](#개발과-설정)

## 주요 기능

- **회사 검색:** 회사명·공개된 사업자등록번호로 검색하고 지역, 최소 가입자 수, 정렬 조건을 선택합니다.
- **회사 상세:** 월별 가입자 수·추정 급여·취득·상실 이력과 업종·가입자 규모별 비교 지표를 확인합니다.
- **사업장 비교:** 최대 3개 사업장의 주요 수치와 고용 추이를 나란히 살펴봅니다.
- **고용 통계:** 월간 고용 동향, 업종별·지역별 추이, 연간 요약과 1·3·12개월 고용 변화 순위를 제공합니다.
- **최근 방문:** 브라우저에 저장한 최근 회사 상세 페이지로 다시 이동합니다.
- **읽기 전용 API:** 회사 검색·상세·이력·고용 요약·사업장 비교와 최신 적재 정보를 인증 없이 조회합니다.

## 데이터 출처와 해석

[공공데이터포털의 국민연금공단 사업장 데이터](https://www.data.go.kr/data/15083277/fileData.do)를 사용합니다.
화면과 API는 적재한 SQLite 데이터를 조회하며, 요청마다 데이터 포털을 호출하지 않습니다.

급여는 **국민연금 기반 추정치**이며 실제 지급액과 다를 수 있습니다. 가입자 수는 실제 재직 인원이나 법적 기업 규모를 뜻하지 않습니다.
취득·상실 건수 역시 실제 입·퇴사 또는 고유 인원과 다를 수 있습니다. 같은 이름의 사업장을 하나의 회사로 단정하지 않습니다.
명시적 일용 사업장은 적재 단계에서 제외합니다.

검색은 최신 적재월의 사업장을 기본으로 보여줍니다. 최신 자료에 없다는 것이 폐업을 의미하지는 않습니다.
과거 사업장은 `과거 사업장 포함`을 선택해 조회할 수 있습니다. 통계 산출 기준은 [공개 통계 문서](docs/public-statistics.md)를 참고하세요.

## 요구사항

- Node.js 22 이상과 npm
- 데이터 다운로드를 위한 인터넷 연결
- 원본 CSV·SQLite·검색 인덱스를 보관할 디스크 공간. 검색 인덱스 생성 명령은 최소 5GB의 여유 공간을 요구합니다.
- `better-sqlite3` 사전 빌드 바이너리를 사용할 수 없는 환경에서는 해당 패키지의 네이티브 빌드 도구가 필요합니다.

## 설치

직접 실행하려면 저장소와 의존성을 설치하고 데이터를 준비합니다. 최초 과거 자료 수집·적재는 수 시간이 걸릴 수 있습니다.

```sh
git clone https://github.com/ersione/company-lens.git
cd company-lens
npm ci
npm run sync:nps-history
npm run search:rebuild
npm run search:refresh-latest
npm run benchmarks:rebuild
npm run stats:build-public
npm run dev -- --port 3100
```

브라우저에서 <http://localhost:3100>을 엽니다. 원본·DB·로그는 Git에 포함하지 않습니다.

전체 자동 수집 대신 공식 CSV를 직접 내려받았다면 `sync:nps-history` 자리에 다음 명령을 사용하고, 이어서 위의 인덱스·통계 생성 명령을 실행합니다.

```sh
npm run import:nps -- data/raw/<file.csv>
```

이후 데이터 갱신에는 `npm run sync:nps-history`를 다시 사용합니다. 수집은 로컬 진행 기록을 기준으로 재개하며,
적재가 완료되면 해당 월의 통계·비교 지표와 이미 생성된 최신 회사 검색 데이터를 갱신합니다. 데이터 쓰기 명령은 하나씩 실행합니다.

## 사용법

1. [서비스](https://companylens.ersione.com) 또는 로컬 화면에서 회사명·공개된 번호를 2~100자로 입력합니다.
2. 필요하면 지역·가입자 규모·정렬·과거 포함 조건을 선택하고 **검색** 버튼 또는 Enter를 누릅니다.
3. 회사명을 눌러 상세 이력과 비교 지표를 확인합니다. 사업장 비교에서는 최대 3곳을 선택합니다.
4. 상단의 고용 동향·고용 변화·업종별·지역별 메뉴로 전체 통계를 살펴봅니다.

API는 서버 간 GET 요청으로 사용할 수 있습니다. 응답의 기준월과 추정치 안내를 함께 확인하세요.

```sh
curl -G 'https://companylens.ersione.com/api/v1/companies' \
  --data-urlencode 'q=삼성전자' --data 'limit=5'
```

매개변수·응답·오류 기준은 [API 문서](https://companylens.ersione.com/api-docs), 기계 판독용 명세는 [OpenAPI JSON](https://companylens.ersione.com/api/openapi.json)에 있습니다.
브라우저에서 다른 출처로 호출하는 CORS 접근은 허용하지 않습니다.

## 개발과 설정

Next.js·React·TypeScript, SQLite/Drizzle, Chart.js와 [Ersione Design System](https://github.com/ersione/ersione-design-system)을 사용합니다.
환경 변수는 `.env.local`에 설정할 수 있으며 비밀값을 Git에 넣지 않습니다.

| 변수 | 역할 | 기본값 |
| --- | --- | --- |
| `DATABASE_URL` | 회사 데이터 SQLite 파일 경로 (`file:` 접두사 선택) | `data/db/company-lens.sqlite` |
| `METRICS_DATABASE_URL` | 이용 집계 SQLite 파일 경로 | `data/db/usage-metrics.sqlite` |
| `METRICS_DISABLED` | `1`이면 백엔드 이용 집계 비활성화 | 집계 활성화 |
| `NEXT_DIST_DIR` | Next.js 빌드 결과 디렉터리 | `.next` |
| `PLAYWRIGHT_BASE_URL` | 브라우저 테스트 대상 주소 | `http://127.0.0.1:3100` |

```sh
npm test
npm run typecheck
npm run build
```

브라우저 테스트에는 Chromium과 테스트에 필요한 데이터를 적재한 실행 중인 서버가 필요합니다.
`npx playwright install chromium`으로 브라우저를 준비한 뒤 `npm run test:browser`를 실행합니다.

자체 배포는 데이터 준비 후 `npm run build`와 `npm run start -- --port 3100`으로 실행합니다.
실행 중인 서버의 빌드 결과를 덮어쓰지 않도록 검증용 빌드에는 별도 `NEXT_DIST_DIR`을 사용하세요.

공개 페이지는 서버 렌더링, 페이지별 대표 URL·공유 메타데이터와 사이트맵을 제공합니다.
최신 적재월 가입자 50명 이상인 사업장 상세를 분할 사이트맵에 포함하고, 내부 검색 결과·사업장 비교·관리자 화면은 색인에서 제외합니다.
사이트맵에 포함되는 것과 검색엔진에 실제 색인되는 것은 별개입니다.

## 라이선스

코드는 [MIT 라이선스](LICENSE)입니다. 공개 데이터에는 별도의 [원본 이용 조건](https://www.data.go.kr/data/15083277/fileData.do)이 적용되며, 이 저장소는 원본 데이터를 배포하지 않습니다.
