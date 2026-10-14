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

launchd `com.ersione.company-lens-web`의 `NEXT_DIST_DIR=.next-nav-clean-v05`가 중복 메뉴 제거·퍼플 고용 변화·오렌지 팔레트를 포함한 v0.5.0 적용 빌드를 가리킵니다. 기존 `.next` 빌드는 보존했습니다.
서비스 설정 백업: `data/logs/web-before-nav-clean-v05.plist` (Git 제외).
다음 배포도 실행 중인 디렉터리를 덮어쓰지 말고 별도 NEXT_DIST_DIR에 빌드·검증한 뒤 launchd 환경변수를 전환하세요.
후보 검사는 METRICS_DISABLED=1로 실행했으며 운영 서비스의 기존 이용 통계 설정은 유지합니다.

초기 v0.2 검증: 앱 단위 테스트 75개, 타입 검사, 별도 운영 빌드, 관련 브라우저 검사 22개 통과.
패키지 자체는 서버 렌더링 검사 6개와 Chromium 브라우저 검사 7개 및 GitHub CI를 통과했습니다.

v0.2.1 검증: 타입 검사·운영 빌드 및 브라우저 검사 14개 통과. 펼친 셀렉트의 실제 검색 필터 적용, 60px 데스크톱 헤더, 320/390px 메뉴 이동 포함. 패키지 자체는 브라우저 검사 8개 및 GitHub CI 통과. 비지원 브라우저의 셀렉트 목록은 기본 picker로 유지합니다.

검색 필터와 과거 사업장 포함은 임시 선택 상태로 유지하고 검색 버튼 또는 검색창 Enter로만 URL과 결과에 적용합니다. 초기화도 선택 상태만 비웁니다. 검색 버튼은 대기 문구에도 크기를 유지하고, 상단 메뉴는 아이콘과 aria-current로 현재 위치 및 상세 페이지의 상위 메뉴를 표시합니다.

검색 제출·메뉴 개선 검증: 단위 테스트 75개, 타입 검사, 별도 운영 빌드, 관련 브라우저 검사 12개 통과. 빈 검색어의 필터 변경 시 검색 요청 없음, 버튼/Enter 제출, 초기화 후 제출·뒤로 가기, 응답 지연 중 버튼 크기 유지(1280/390/320px), 모바일 헤더와 상세 페이지 메뉴 표시를 확인했습니다.


## 공통 메뉴·팔레트·수치 강조 (v0.4)

- Navigation / NavigationLink가 아이콘·현재 메뉴·포커스·크기 스타일을 담당합니다. 이 앱의 HeaderNavigation은 경로 매칭과 Next Link 연결만 담당합니다.
- 공통 팔레트는 blue/teal/amber/purple/rose와 각 tint입니다. 저장·검색(primary), 취소·닫기(secondary), 삭제(danger) 같은 UI 의미만 공통으로 유지합니다.
- 인원=블루, 금액=틸, 취득=틸, 상실=오렌지, 변동=퍼플는 **Company Lens가 선택한 매핑**이며 다른 프로젝트를 제한하지 않습니다. CSS 매핑은 app/design-system.css, Canvas 매핑은 lib/use-chart-theme.ts에 둡니다.
- EmploymentSummary는 공통 HighlightPanel / Card / DataHighlight를 조합합니다. 배경보다 핵심 수치를 강조하며, 누락 데이터는 muted로 표시합니다.
- 회사·통계·관리자 차트는 공통 chart theme의 팔레트·폰트·그리드·범례·툴팁·선 스타일을 사용합니다. 축 단위·데이터·툴팁 포맷·간격 선택은 앱이 담당합니다. 테마 변경 시 재생성하며 색상과 무관한 Canvas 크기 변경은 재생성을 유발하지 않습니다.
- 공통 팔레트 문서: ersione-design-system/docs/COLORS.md 및 docs/palette.html. 라이트/다크와 블루/오렌지 브랜드를 직접 비교할 수 있습니다.


v0.4 검증: 패키지 SSR 검사 8개·브라우저 검사 11개·네 테마의 팔레트/텍스트 대비 검사 및 GitHub CI 통과. 앱 타입 검사·별도 운영 빌드와 관련 브라우저 시나리오 15개 통과(최종 요약/차트 및 관리자 시나리오 재검증 포함). 빈 관리자 데이터 전용 검사는 별도 빈 fixture 환경이 없어 미실행했습니다. 관리자는 후보 localhost 서비스에만 COMPANY_LENS_ADMIN_ALLOW_LOCAL_HTTP=1을 사용해 확인했으며 운영은 HTTPS 제한을 유지합니다.


## v0.5 통계 메뉴·강조색 정리

- 상단 주 메뉴와 겹치는 StatisticsTabs 및 해당 CSS를 제거했습니다. 비교 기간·증감 방향·정렬 등의 데이터 필터는 유지합니다.
- Company Lens의 변동 강조는 퍼플, 자격상실은 오렌지로 선택했습니다. 인원은 블루, 금액·취득은 틸입니다. 루트 역할 매핑은 패키지 테마와 같은 선택자 우선순위로 선언해 프로젝트 선택이 실제 적용되게 했습니다.
- 공통 패키지 v0.5.0은 palette-orange를 사용하며 amber 토큰·CSS·타입·Canvas 별칭을 제공하지 않습니다.
- 디자인 시스템 공개 사이트 https://ersione-design-system.ersione.chatgpt.site 에 메뉴·하이라이트·팔레트 및 실제 React playground를 별도로 게시했습니다.

v0.5 검증: 타입 검사·별도 운영 빌드·관련 브라우저 시나리오 7개 통과. 상위 메뉴 현재 위치, 중복 통계 메뉴 없음, 고용 변화의 실제 퍼플 색상, 비교 기간·방향·정렬·스크롤, 통계/지역/업종 이동과 모바일 레이아웃, 수치·차트의 동일 팔레트를 확인했습니다.
