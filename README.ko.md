# Company Lens

한국어 | [English](README.md) · [서비스](https://companylens.ersione.com) · [API 문서](https://companylens.ersione.com/api-docs)

국민연금 공개 데이터로 회사를 검색하고 가입자 수, 추정 급여, 고용 이력,
업종·가입자 규모별 비교 지표를 확인합니다. 최대 3개 사업장 비교, 브라우저별
최근 방문 기록, 관리자용 이용 통계 화면을 제공합니다.
월간 고용 동향·업종별·지역별 통계에서 월별 추이와 연간 요약을 확인할 수 있습니다.
고용 변화(`/employment-trends`)에서는 전월·3개월·1년 대비 증가/감소 업종을 인원·비율순으로 비교합니다.

검색은 두 글자 이상이며 기본은 최신 적재월·가입자 수순입니다. `과거 사업장 포함`으로
이전 기록도 조회할 수 있으며, 최신 자료에 없다는 것이 폐업을 뜻하지는 않습니다.

급여는 실제 지급액이 아닌 **국민연금 기반 추정치**입니다. 가입자 수는 법적 기업
규모 분류가 아니며, 이름이 비슷하다고 같은 회사로 판단하거나 이력을 합치지 않습니다.
`/일용/`, `(일용)`, `건설일용관리` 등 명시적 일용 사업장은 적재하지 않습니다.

**기술:** Next.js, TypeScript, Tailwind CSS, SQLite/Drizzle, Chart.js. Node.js 22 이상과 npm이 필요합니다.

## 실행

```sh
npm ci
npm run sync:nps-history          # 최초 과거 자료 다운로드·적재: 수 시간 소요 가능
npm run search:rebuild           # 최초 적재 후 FTS 검색 인덱스 생성
npm run search:refresh-latest
npm run benchmarks:rebuild
npm run dev -- --hostname 0.0.0.0 --port 3100
```

`http://localhost:3100` 또는 `http://<LAN-IP>:3100`으로 접속합니다.
[공식 CSV](https://www.data.go.kr/data/15083277/fileData.do)를 `data/raw/`에 넣고
`npm run import:nps -- data/raw/<file.csv>`로 적재한 뒤 인덱스·비교 지표를 생성해도 됩니다.
화면과 API는 로컬 SQLite만 조회하며 데이터 포털을 직접 호출하지 않습니다.

관리 중인 운영 서비스는 별도 경로에서 후보 빌드·검증을 먼저 진행합니다.

```sh
NEXT_DIST_DIR=.next-candidate npm run build
METRICS_DISABLED=1 NEXT_DIST_DIR=.next-candidate npm run start -- --hostname 127.0.0.1 --port 3101
```

브라우저 검증 후 launchd 서비스의 `NEXT_DIST_DIR`을 검증한 빌드로 전환하고
재시작합니다. 운영 지표 설정과 이전 빌드는 보존합니다.
[디자인 시스템 운영 문서](docs/design-system.md)를 참고하세요. 실행 중인 운영
빌드에 덮어쓰지 마세요. 코드 변경 시 재빌드가 필요하지만 CSV 적재 후에는
필요 없습니다. DB 교체 전에는 일관된 SQLite 백업을 만들고 새 DB를 별도 포트에서 검증합니다.

## 공통 디자인 시스템

현재 `@ersione/design-system`은 `github:ersione/ersione-design-system#v0.5.1`로 고정합니다. 공통 메뉴·현재 위치·폼 컨트롤·차트 테마·수치 강조를 사용하며, 최근 고용 흐름은 DataPanel / DataBadge / DataHighlight로 표현합니다. 인원=블루, 금액·취득=틸, 상실=오렌지, 변동=퍼플은 Company Lens의 매핑입니다.

업데이트는 새 태그를 지정해 설치한 뒤 검증·빌드·배포합니다. 인자 없는 npm install은 현재 lockfile 버전을 다시 설치합니다.

```sh
# v0.5.1을 선택한 새 릴리스 태그로 교체
npm install github:ersione/ersione-design-system#v0.5.1
npm run typecheck
npm test
NEXT_DIST_DIR=.next-candidate npm run build
METRICS_DISABLED=1 NEXT_DIST_DIR=.next-candidate npm run start -- --hostname 127.0.0.1 --port 3101
```

운영 서비스는 현재 `.next-soft-v051`을 사용합니다. 후보 브라우저 검증 후 launchd의 NEXT_DIST_DIR을 전환하고 재시작합니다. 실행 중인 빌드·통계 설정·데이터 파일을 덮어쓰지 않습니다. package.json과 package-lock.json을 함께 커밋합니다. 상세 절차와 검증 기록은 [디자인 시스템 운영 문서](docs/design-system.md)를 참고하세요.

## 설정

Next.js는 시작할 때 프로젝트 `.env`와 `.env.local`을 읽으며 `.env.local`이 우선합니다.
`.env`에 `ADMIN_USER_ID`, `ADMIN_PASSWORD`를, `.env.local`에 32자 이상의 무작위
`COMPANY_LENS_ADMIN_SESSION_SECRET`을 설정합니다. 서명 키는 `openssl rand -hex 32`로
생성할 수 있습니다. 두 파일의 권한은 `600`으로 제한하고 변경 후 서버를 재시작합니다.
모두 서버 전용이며 `NEXT_PUBLIC_` 접두사를 쓰거나 Git에 올리지 않습니다.

`/admin`은 아이디와 비밀번호가 모두 맞아야 로그인되며 세션은 8시간 유지됩니다.
운영 로그인은 `https://companylens.ersione.com/admin`에서만 허용하고 LAN HTTP는 차단합니다.
공개 API v1은 인증 없이 사용하며 OpenAPI 명세는 `/api/openapi.json`에 있습니다.

기본 회사 DB는 `data/db/company-lens.sqlite`, 이용 통계 DB는 `data/db/usage-metrics.sqlite`입니다.
`DATABASE_URL` / `METRICS_DATABASE_URL`로 변경하고 `METRICS_DISABLED=1`로 수집을 끌 수 있습니다.
백엔드 요청, 검색, 회사 조회, 처리시간·오류를 자동으로 90일간 집계합니다.
고유 방문자 수는 아니며, 백엔드에 도달하지 않은 캐시 응답은 제외됩니다.
`/admin`을 새로고침하면 최신 집계를 표시합니다. 최근 방문 기록은 브라우저에만 저장됩니다.

## 운영 명령

| 작업 | 명령 |
| --- | --- |
| 다운로드·적재 없이 수집 대상 확인 | `npm run sync:nps-history -- --dry-run` |
| 수집 재개·갱신 후 검증된 최신 원본만 유지 | `npm run sync:nps-history -- --prune` |
| 통계 / 비교 지표 복구 | `npm run stats:rebuild` / `npm run benchmarks:rebuild` |
| 과거 공개 통계 최초 생성·재개 | `npm run stats:build-public` (전체 재생성은 `-- --force`) |
| DB 교체·직접 SQL 수정 후 검색 재생성 | `npm run search:rebuild` 후 `npm run search:refresh-latest` |
| 기존 DB에 가입자 수 보조 인덱스 추가 | `npm run search:index-employees` (전체 이력 재생성 없이) |
| 기존 DB에 두 글자 보조 인덱스 추가 | `npm run search:rebuild-short` |
| 기존 일용 사업장·이력 정리 | `npm run data:prune-daily`로 집계 후 `-- --apply`로 별도 검증 DB 생성·수동 교체 |
| 최근 30일 이용 통계 보고서 | `npm run metrics:report -- 30` |
| macOS 월간 자동 수집 등록 | `npm run sync:start-job` |
| 빌드 후 macOS 운영 웹 서비스 등록 | `npm run web:start-job` |
| 등록된 웹 서비스 재시작 | `launchctl kickstart -k gui/$(id -u)/com.ersione.company-lens-web` |

적재하면 통계·비교 지표와 이미 생성한 최신 검색 데이터가 자동 갱신되며 FTS는 트리거로
유지됩니다. 데이터 쓰기 작업은 하나씩 실행하고 적재 중에는 강제 종료하지 않습니다.
수집은 `data/nps-history-manifest.json`을 기준으로 재개합니다. 실패 시
`data/nps-sync-status.json`과 `data/logs/`를 확인합니다. 원본·DB·비밀값·로그는 Git에서 제외합니다.

macOS 서비스는 사용자 로그인 시 시작됩니다. 수집 등록에는 시스템 시간대 Asia/Seoul이
필요하며, 매월 말일 04:00에 실행하고 미완료 작업은 다음 달 1~3일 및 로그인 시 재시도합니다.
`launchctl print gui/$(id -u)/com.ersione.company-lens-sync`로 상태를 확인합니다.
웹 서비스는 `com.ersione.company-lens-web`, 로그는 `data/logs/web.log`와 `data/logs/web-error.log`입니다.

## 검증·참고

`npm test`, `npm run typecheck`, 별도 경로의 `npm run build`로 검증합니다.
브라우저 테스트에는 실행 중인 서버·테스트에 맞는 데이터·Chromium이 필요합니다.
`npx playwright install chromium` 후 `npm run test:browser`를 실행합니다.
다른 주소는 `PLAYWRIGHT_BASE_URL`로 지정합니다.

[디자인 시스템](docs/design-system.md) · [API 명세](docs/api.md) · [공개 통계 기준](docs/public-statistics.md) · [메트릭·인증 상세](docs/usage-metrics.md) · [변경 이력](CHANGELOG.md)

코드는 [MIT 라이선스](LICENSE)입니다. 공개 데이터는 별도의 [원본 이용 조건](https://www.data.go.kr/data/15083277/fileData.do)을 따르며 이 저장소에 배포하지 않습니다.
