# Ersione 디자인 시스템 적용

공통 패키지: `@ersione/design-system`, 저장소: https://github.com/ersione/ersione-design-system.
소비 버전은 package.json과 package-lock.json의 Git 커밋으로 고정합니다.

## 책임 구분

- 패키지: 토큰 JSON, 생성 CSS, `eds-*` 스타일, React 컴포넌트와 타입.
- company-lens: 데이터 조회·계산, 검색/필터 상태, URL, 페이지 구성과 정보 밀도.
- `app/layout.tsx`: 패키지 styles.css와 브랜드 심볼 로딩. 로컬 Noto Sans KR 로딩은 기존 앱이 담당합니다.
- `app/design-system.css`: 서비스별 배치·밀도와 기존 화면의 스타일 연결. 공통 Button/Input 등을 이 파일에서 새로 구현하지 않습니다.
- 검색·필터·체크박스·오류·과거 자료 배지·홈/회사 지표·월별 표부터 공통 컴포넌트를 사용합니다.
- 현재 서비스는 블루/라이트 테마입니다. 패키지의 네 가지 테마 지원이 모든 기존 차트·관리자 화면의 다크 모드 전환을 뜻하지 않습니다.

## 업데이트

1. 디자인 시스템 저장소에서 소스를 수정하고 build/check/test/test:browser를 실행합니다.
2. 검증한 커밋을 Git에 push합니다.
3. 이 저장소에서 `npm install github:ersione/ersione-design-system#<commit-sha>`로 고정 버전을 갱신합니다.
4. `npm run typecheck`, `npm test`, 별도 NEXT_DIST_DIR의 build와 브라우저 테스트를 실행합니다.
5. 운영 서비스가 사용하는 빌드 디렉터리를 확인한 뒤 검증한 후보를 배포합니다. 실행 중인 빌드 위에 덮어쓰지 않습니다.

패키지를 업데이트해도 실행 중인 서비스에는 즉시 반영되지 않습니다. 앱 빌드와 서비스 재시작이 필요합니다.
React 검토 화면은 디자인 시스템 저장소의 `examples/react/`입니다. Vue 전용 래퍼와 바닐라 JS API는 후속 범위입니다.

## 현재 운영 빌드 (2026-10-14)

launchd `com.ersione.company-lens-web`의 `NEXT_DIST_DIR=.next-eds-v02`가 검증한 v0.2 적용 빌드를 가리킵니다. 기존 `.next` 빌드는 보존했습니다.
서비스 설정 백업: `data/logs/web-before-eds-v02-493547d0.plist` (Git 제외).
다음 배포도 실행 중인 디렉터리를 덮어쓰지 말고 별도 NEXT_DIST_DIR에 빌드·검증한 뒤 launchd 환경변수를 전환하세요.
후보 검사는 METRICS_DISABLED=1로 실행했으며 운영 서비스의 기존 이용 통계 설정은 유지합니다.

검증: 앱 단위 테스트 75개, 타입 검사, 별도 운영 빌드, 관련 브라우저 검사 22개 통과.
패키지 자체는 서버 렌더링 검사 6개와 Chromium 브라우저 검사 7개 및 GitHub CI를 통과했습니다.
