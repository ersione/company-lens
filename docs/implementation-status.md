# Implementation Status

## Password-Protected Admin Dashboard

- `/admin` checks the signed session before loading aggregates; unauthorized HTML/RSC receives only the ID/password form. Both `ADMIN_USER_ID` and `ADMIN_PASSWORD` from the ignored project `.env` must match, with no auth/account database. The signing secret is kept in `.env.local`; no credential values are recorded here.
- Eight-hour HttpOnly/Strict/host-only cookie scoped to `/admin`, Secure on public HTTPS; logout clears it. Bound request bodies, check exact HTTPS public/loopback origins, rate-limit login attempts in process memory, and apply private/no-store/noindex/frame-denial headers. LAN HTTP password submission is rejected. Temporary shared-credential limitations are documented; rotating the ID, password or secret invalidates sessions after restart.
- Reuse Chart.js for daily traffic, keyword trends/ranking, workplace popularity, historical subscriber-size trends/shares, weighted processing time/p95 bucket bounds and 4xx/5xx charts. Period/channel filters, missing-data/error states and responsive controls; status checks and pagination do not inflate visitor/search-intent KPIs.
- Verification: 63 unit/API tests, typecheck and isolated production build passed. Populated and empty dashboard browser checks passed; 1280/390/320px layouts and all populated chart canvases were verified. Regression coverage retains total company views across multiple observed size bands and checks that keyword columns fit without horizontal scrolling. Wrong ID, wrong password, missing/duplicate input, session tampering/expiry/rotation, login/logout, unauthenticated HTML/RSC and channel/period filters are covered.
- Activated the verified build via a brief launchd restart, retaining `.next-before-admin-2026-10-11T20-14-02-086Z` for rollback. Local/public status returned 200; public HTTPS login/filter/logout/isolation checks passed with Secure cookies using the project `.env` credentials. Production loopback HTTP login returned 403. No business database/index/schedule changes or commit/push.

## Backend Usage Metrics

- Observe web page handlers and all six v1 API handlers separately; no browser beacon or public stats endpoint. Skip known web bots/prefetches and metadata; detail popularity is not inflated by nested/history/comparison reads.
- Separate 90-day KST SQLite daily aggregates: normalized/redacted search trends and outcomes, successful workplace detail popularity and observed subscriber-size bands, handler latency histograms/average/max and HTTP 4xx/5xx. No IP/user ID/raw request log/local history collection. Bound new search/company keys and retain overflow totals.
- Read-only operator JSON report: `npm run metrics:report -- 30`. Full scope, privacy controls, cache exclusions and measurement limitations are documented in `docs/usage-metrics.md`.
- Verification: 58 unit/API tests, typecheck and isolated production build passed. Eight focused browser tests passed across recent history, responsive search and backend aggregate deltas. Corrected a test-only Headers union type and a prefetch fixture: Next requires `rsc: 1` alongside the router-prefetch header; actual router/purpose prefetches and known bots were confirmed excluded.
- Activated the verified build with a brief launchd web restart; retained `.next-before-usage-metrics-2026-10-11T19-34-47-342Z` for rollback. Local/public status and public search returned 200. The read-only report confirmed live KST search-term and latency aggregates in the separate metrics database. Public recent-history isolation/deletion and local comparison desktop/mobile workflows also passed after activation. Pension data/indexes and collection schedules were unchanged; no commit/push.

## Browser-Local Recent Visits

- Replace fixed example company links with recent workplace visits on the initial screen only; hide the section for a new/empty browser. Successful detail mounts record ID, display name and visit timestamp; server rendering/prefetching does not record visits.
- Use localStorage key `company-lens:recent-companies:v1`, at most five unique IDs, newest first. Revisit updates the name/time and moves the workplace first. Thirty-day expiry is enforced when records are read, with invalid/expired records cleaned on subsequent use.
- Individual/all deletion, same-tab updates and cross-tab storage synchronization. Validate untrusted stored records, strip extra properties and tolerate disabled storage. No accounts, server sync, new endpoints or visit-history transmission; a shared browser profile shares this local history.
- Service usage analytics were not part of the original recent-history change. The subsequent backend-only metrics feature above now collects requested search trends and aggregate origin requests, independently of private browser history. IPs/user identifiers remain excluded; infrastructure access logs are a separate concern.
- Public verification revealed existing Cloudflare `/cdn-cgi/rum` beacons, independent of this app feature. No claim is made that the public site has no infrastructure analytics. Visit tests distinguish these pre-existing beacons from application POSTs and check that the local history key/visit timestamps are not transmitted.
- The initial public test incorrectly rejected all POSTs and failed on those beacons. After scoping that assertion, the public persistence/profile isolation/cross-tab deletion workflow passed with no application POSTs or recent-history payloads. Cloudflare documents RUM's existing collection and lack of localStorage access at <https://developers.cloudflare.com/speed/observatory/rum-beacon/>; dashboard configuration/data has not been audited here.
- Verification: 54 unit/API tests, typecheck and production build passed. Seven final browser tests cover persistence/revisit ordering, isolated profiles, same/cross-tab deletion, absent server-rendered history, no visit POSTs, malformed/expired records, blocked storage, mobile long-name wrapping, history charts, hydration and search-view regression. Screenshots were visually inspected; long names are limited to two lines with full-name tooltips.
- Activated the verified build via a brief launchd web restart, retaining the previous build. Local/public status returned 200. No database/index changes, analytics deployment or commit/push.

## Results-First Search Screen

- Preserve introduction and dataset overview only before searching (fixed example links are now replaced by browser-local recent visits above). Search/error states use a compact search/filter toolbar; the Company Lens brand returns to the initial screen.
- Results have their own H1 with an emphasized query, prominent exact count and secondary page totals. Keep a short National Pension estimate/source note, existing pagination, filters and empty/error handling. No query/API/database changes.
- Verification: 53 unit/API tests, typecheck and production build passed. Ten targeted browser tests cover 1280/390/320px search submission, first-result viewport visibility, brand return, long/empty/invalid queries, filters/pagination, shortcuts, broad-query protection and hydration. PC/mobile screenshots were visually inspected without overflow or overlap.
- Activated the verified build with a brief launchd web restart and retained the previous build. Local/public home, result HTML and status returned 200; the 390px search/brand-return browser workflow also passed against the public domain. No commit/push.

## Exact Search Totals And Numbered Pagination

- Search counts all visible matching workplaces before fetching the requested page. Count/list predicates are shared and both run inside one SQLite read transaction. Similar-name suggestions retain the bounded list-only path; no application count cache or database/index changes.
- Web search shows exact result/page totals and numbered links including the first/last available page, current-page state, gaps and mobile wrapping. Filters/sort remain in links; beyond-result URLs retain empty lists/totals and offer a first-page link.
- OpenAPI 1.5.0 adds `totalCount` and `totalPages`; empty results have zero pages, `hasMore` is `page < totalPages`, and page requests remain capped at 1000 even if the exact page total is larger. The 20,000 pre-filter candidate guard still runs before full count/list work.
- Actual count plan uses FTS5 virtual-table MATCH, company/latest primary-key lookups and `company_snapshots_latest_idx` for earlier canonical observations. No full snapshot-table scan or count sorting. Measured count-only samples: Samsung 158–205ms, Hyundai 44ms, Samsung with Gyeonggi/50+ filter 86ms. Concurrent local build/tests can affect timings.
- Current data: Samsung 408 visible workplaces / 21 pages at 20 per page; Hyundai 450 / 23; filtered Samsung 36 / 2. These totals can change after imports.
- Verification: 53 unit/API tests, typecheck, production build and eight targeted browser tests passed. Checked exact totals, canonical-revision parity, zero/last/out-of-range pages, preserved filters, broad-query guard and 1280/390/320px pagination screenshots without overflow.
- Activated the verified candidate via a brief launchd web restart, retaining the previous build. Local/public status, third-page Samsung search and OpenAPI 1.5.0 returned 200; public search sample was 399ms including network. No database/index changes or commit/push.
- Repeated the numbered-page browser workflow against the public domain after activation: passed, including last-page navigation, out-of-range recovery and mobile bounds.

## Single-Month Zero-Subscriber Discovery Filter

- Also exclude latest-zero workplaces with only one canonical observation month regardless of age (OpenAPI 1.4.4). Apply before pagination to web/API searches and similar-name suggestions; keep direct details/history and earlier/later record links.
- Test whether an earlier canonical month exists using `company_snapshots_latest_idx (company_id, snapshot_month)`; do not count all history, add indexes, delete data or rebuild FTS/latest metrics. Superseded revisions neither extend history nor make an otherwise hidden record eligible.
- Positive/unknown counts and recent ordinary zero counts with multiple canonical months remain eligible. One observed month is not a company's lifetime or proof of same-month registration/withdrawal.
- Example 3 has one 2026-08 observation, count/billed/joiners/departures zero, and subscription status `2` (withdrawn). This identifies the reported status, not the registration date or reason earlier observations are absent.
- Official dataset documentation describes reporting cutoffs, billing-based movement counts and disclosure thresholds (3+ corporate / 10+ individual subscribers since July 2025): <https://www.data.go.kr/data/15083277/fileData.do>. Missing months can reflect disclosure/identity changes; do not infer a specific cause from one row.
- Unit/API tests: 52 passed; typecheck and isolated production build passed. Representative direct queries returned Samsung in 154ms, 주식회사엑셈 in 69ms and omitted 신영인사이트 in 54ms on this machine; these are samples, not a latency guarantee.
- Six targeted browser tests passed: recent singleton zero, recent daily-worker zero, stale zero, broad-query guard, filters and pagination. Activated the verified build with a brief launchd web restart; kept the previous build for rollback. Local/public status, searches, preserved direct detail and OpenAPI 1.4.4 returned 200, with excluded IDs absent and the main Samsung workplace retained. No database/raw data was deleted; no commit/push.

## Broad Search Protection

- Observed the web process still running while a status request timed out; restart restored status response. `(일용` yielded at least 20,001 FTS candidates in a bounded probe (11ms sample). The old synchronous query could materialize all candidates, look up latest rows and sort before applying LIMIT, blocking other web requests.
- Reject more than 20,000 pre-filter name/number matches before those joins/sorts. The indexed preflight reads at most 20,001 row IDs, never a full count. UI/comparison show refinement guidance, API returns 400 INVALID_REQUEST with no-store, and optional related suggestions fail closed. The limit retains popular real company searches such as Samsung (17,527 raw name matches, many historical construction records).
- This bounds candidate workload; it is not a worker-isolation, rate-limit or absolute query-time guarantee. Existing ingress limits remain an infrastructure concern.
- Verification: 50 unit/API tests, typecheck and final production build passed. Nineteen existing browser tests passed; the new broad-search test passed after scoping its alert locator to main (excluding Next's route announcer). Checked web/comparison guidance, API 400/no-store, and healthy status plus a successful Samsung search immediately afterward.

## Stale Zero-Subscriber Discovery Filter

- Extended: zero-subscriber records explicitly marked `(일용)`, `(일용직)`, `/일용/`, `-일용-` or `[일용]` are excluded regardless of age (full-width parentheses accepted). This covers recent Samsung construction records such as 62114128. Positive/unknown daily-worker counts and direct detail/history remain intact; ordinary names containing 일용품 are not classified by substring alone.
- Extension verification: 51 unit/API tests, typecheck, production build and four targeted browser tests passed (recent Samsung zero-count exclusion, preserved direct details/main company/positive daily-worker records, broad-query protection, filters and pagination). Query fixtures cover FTS/unprovisioned/latest-index parity, full-width markers and ordinary 일용품 names.
- Search and similar-name suggestions exclude records whose latest canonical subscriber count is exactly zero and last observation is at least 12 months behind the latest canonical dataset month (latest source month fallback before statistics provisioning).
- Preserve recent ordinary zero counts with multiple canonical months, unknown counts, positive historical counts, direct details/history, and earlier/later name candidates. Do not infer closure or exclude all construction/daily-worker names. The single-month rule above extends the original age-based policy.
- Apply the filter before relevance/subscriber sorting, pagination and prefix-shortcut limits. Reuse latest-company primary-key lookups and FTS; no historical row counts, new indexes or database deletion.
- Verified example 12261967 has one zero-subscriber observation in 2018-01; it no longer appears in discovery while its detail/history remain accessible.
- Verification: 49 unit/API tests, typecheck, production build and all 19 browser tests passed. Covers the 12-month boundary, advancing dataset month, missing counts, recent zero counts, pagination, FTS/fallback/latest lookup parity and preserved direct details. Query plan still uses FTS and latest-company primary keys without a history scan.

## Adjacent Record Candidates

- Detail pages and insights API expose up to six earlier/later record candidates (OpenAPI 1.4.0).
- Require matching nonempty public number/address, similar normalized names, and adjacent canonical observation ranges. Partial numbers/addresses are not unique; candidates are not confirmed renames or legal relationships.
- Reuse provisioned registration FTS and indexed per-company snapshot lookups, with a 50-candidate pool guard. No new index or raw-data collection; no identities, histories, charts or aggregates are merged.
- Bus mutual-aid records 888149 and 128813 are reciprocal candidates; each retains its own history.
- Verification: 48 unit/API tests, typecheck, production build and all 18 browser tests passed. Reciprocal candidate links, separate history endpoints and 1280px/390px/320px wrapping were checked; candidate screenshots were visually inspected.

## Employment and Size Cohorts

- Added exact 36-month endpoint comparisons, complete trailing-12-month acquisition/loss totals,
  and deterministic one-year/three-month trend text. Missing months are not bridged for totals or recent trends.
- Added `company_size_cohorts`, keyed by industry/subscriber band. Latest canonical active workplaces
  are grouped into 1-9 / 10-49 / 50-299 / 300-999 / 1000+ subscribers. Salary and year-over-year
  growth medians independently require 30 valid observations; no legal size classification is inferred.
- Benchmark rebuilds and imports refresh the cache transactionally. Revising the year-ago canonical
  source also refreshes growth medians. Request handlers read indexed cached results only.
- Company identities are not automatically merged across name changes. The bus mutual-aid Gyeonggi
  records (IDs 888149 and 128813) share a partial registration number/address and adjacent observation
  periods, but lack a verified full identifier; their histories remain separate.
- Verification: 47 unit/API tests passed, production build and typecheck passed, and all 17 browser
  tests passed after fixing long-name wrapping and pre-hydration canvas sizing. Desktop/390px/320px
  cohort and employment screenshots were inspected; chart pixel/interaction tests also passed.
- Provisioned 1,460 latest-month industry/size cohorts locally (1,238 with sufficient growth samples).
  Lookup plan uses the benchmark primary key, snapshot source/company/month index, and cohort composite
  primary key; no aggregate scan runs on requests. Existing FTS/search behavior is unchanged.

## Current MVP State

This repository now contains a first-pass Company Lens MVP scaffold:

- Next.js App Router application with TypeScript and Tailwind CSS.
- SQLite database access through `better-sqlite3`.
- Drizzle schema definitions for:
  - `source_files`
  - `companies`
  - `company_snapshots`
- Local migration helper at `db/migrate.ts`.
- National Pension Service CSV import command at `scripts/import-nps.ts`.
- Korean-first search page at `/`.
- The initial page shows search, dataset information, and precomputed public-data statistics. Company results are queried and displayed only for nonblank searches; there is no recently imported company list.
- Basic company detail page at `/companies/[id]`.
- Import-focused tests in `tests/nps-import.test.ts`.

The app intentionally does not call `data.go.kr` from user-facing pages. CSVs can be supplied manually under `data/raw/` or fetched by the local history batch command. All data remains ignored by git.

## Public Search Guard (2026-10-11)

- Web and API search now share one input validator: 3-100 Unicode characters, at least three digits for number-only searches, and rejection of wildcards, ASCII controls (before trimming), and duplicate `q` values. The web landing state still permits absent/blank/space-only input without searching.
- Invalid web searches display an accessible form error without calling company search or loading population statistics. Error inputs are bounded before being echoed in the form; duplicate query values no longer cause an array `.trim()` rendering error.
- Cache policy remains API success 60 seconds, OpenAPI 300 seconds, and API errors `no-store`. Browser checks compare query/limit/month-range variants and verify dynamic HTML/RSC are not publicly cacheable. This verifies application/origin behavior, not an external CDN configuration.
- Public target is `https://companylens.ersione.com`. Bot integration documentation separates the same-host private API base from the public link base. DNS/Tunnel/nginx/request limits and external validation remain owned by the infrastructure session; no bot deployment is performed here.
- Verified 28 unit/contract tests, the Webpack production build, TypeScript checking, and all ten Chrome browser tests on both candidate and deployed LAN origins. Real client navigation confirmed RSC `no-store`; query/limit/from/to variants remained distinct on repeated requests. Invalid-search layout was visually checked at 320px. The launchd service was restarted successfully and the same-host status endpoint returned 200; error logs remained empty.

## Read-Only API v1 (2026-10-11)

- Added unauthenticated GET routes for company search, latest detail/comparisons/benchmarks, bounded monthly history, and dataset status. Reuse the web query and calculation functions; no database migration or bot deployment is required.
- Explicit response DTOs exclude internal source filenames and paths. Success responses include source, KRW currency, and the Korean pension-estimate caveat; null stays distinct from zero. Errors use consistent 400/404/500 JSON responses without exposing server diagnostics.
- Validate IDs, query length, duplicate/unknown parameters, limits, and calendar-month ranges before querying. API searches require at least three characters; search returns up to 20 rows and history up to 240, with `hasMore`. History filtering and limiting happen in SQLite, not after an unbounded API fetch.
- Added `/api-docs`, the generated `/api/openapi.json` OpenAPI 3.0.3 contract, and `docs/api.md` for bot integration and infrastructure handoff. Authentication and permissive browser CORS are intentionally absent. Public DNS, ingress, and edge rate limits remain infrastructure follow-up work.
- Contract tests validate the OpenAPI document and actual route responses with Swagger Parser/Ajv using an isolated SQLite fixture. Browser coverage exercises real indexed company data, API errors, method rejection, history consistency, specification delivery, and responsive docs.
- Verification passed: 25 unit/contract tests, TypeScript checking, the Webpack production build, and all eight Chrome browser tests on the candidate and deployed LAN service. The final deployed docs table was visually checked at 320px with all parameter columns visible; server error logs remained empty. A warm LAN Samsung API search returned HTTP 200 in 0.220s (sample, not a latency guarantee).

## Typography And Secondary Metrics (2026-10-11)

- Bundle the variable Noto Sans KR font through Fontsource, with local WOFF2 delivery and no browser requests to a third-party font server. Use the same family for charts, waiting for font readiness before drawing.
- Raised the base text to 16px and enlarged company metadata, benchmark labels, source notes, and chart controls. Increased muted text contrast and kept Korean words together during wrapping.
- Month-over-month changes now use bold 16-17px values and direction icons. Monthly salary and acquisition/loss counts use 20-21px figures with explicit National Pension labels. Missing values and existing calculation rules are unchanged.
- Mobile abbreviates the subscriber label, stacks acquisition/loss rows, and adjusts large subscriber figures at 320px. Browser coverage checks local font responses, the actual custom font used for Korean glyphs, minimum secondary-value sizes, and large Samsung counts without wrapped figures.
- Verified 17 unit tests, TypeScript checking, and the Webpack production build. All seven Chrome browser tests passed against both the candidate and the deployed LAN service, including actual Korean webfont rendering and responsive metric layouts.

## Company Detail Refresh (2026-10-10)

- Added latest-month national and industry comparisons for subscriber scale and estimated salary. Precomputed 552,098 workplace rows for August 2026 in `company_benchmarks`; lookups use the company primary key. The import/statistics transaction refreshes only the latest canonical month, and `npm run benchmarks:rebuild` supports an explicit rebuild.
- Descending cumulative percentiles include ties. Only active workplaces with positive subscriber counts participate; salary comparisons require a positive estimate. Industry cohorts with fewer than 30 valid observations or unknown/mixed labels are hidden. Older companies without the cached month do not receive a misleading current-month comparison.
- Added blue/green percentile panels, colored metric icons and values, a stronger brand accent, and percentage labels on home-page size distributions. Seventeen unit tests cover benchmark eligibility, ties, small cohorts, canonical revisions, older-month imports, and atomic cache refresh. Real Nike Korea percentiles were independently checked against direct population counts; cache integrity and foreign keys passed.

- Replaced the six equal-weight cards and large estimate warning with a compact company identity header, industry/location metadata, a National Pension Service source link, and three primary metrics: estimated annual salary, subscriber count, and monthly acquisition/loss net change.
- Salary and subscriber comparisons use only the immediately preceding calendar month; missing months are not treated as zero or compared with older observations. Monthly salary and acquisition/loss totals remain visible as secondary values. Net acquisition/loss is not labeled as actual hiring or headcount change.
- The desktop chart sits alongside an unframed company facts column; mobile stacks them. Removed raw source filenames from the UI. Monthly rows and calculation/source details remain expandable, with billed amount inside the calculation details.
- Reduced chart tick density to prevent overlapping mobile dates. Verified Nike Korea screenshots at 1731, 1280, 900, 390, and 320 pixels. Six browser tests cover responsive layout, source display, expandable details, search/navigation, chart controls, and canvas rendering. All sixteen unit tests pass.

## Compact Database Replacement (2026-10-10)

- Activated schema version 2 after creating and verifying a separate candidate. The database decreased from 19,815,628,800 to 13,928,779,776 bytes (29.7% smaller).
- Preserved all 67,189,458 snapshots across 130 months (November 2015 through August 2026), 4,519,408 workplace identities, original IDs and sequence state, source metadata, and monthly statistics.
- Removed stored salary estimates and per-snapshot import timestamps. Queries derive the same rounded salary values from the billed amount, subscriber count, and historical contribution rate; source import timestamps remain available. Consolidated overlapping snapshot indexes while retaining latest-history, source/uniqueness, month, and full-text search access paths.
- Compared every retained row and both derived salary values with the original database. Full SQLite integrity, foreign-key, and full-text content checks passed before activation. Database statistics were regenerated only in the candidate.
- Candidate and production HTTP comparisons matched the original overview, ordered search results, detail values, and all 130 Samsung history rows. Fourteen unit tests, the production build, and five Chrome browser tests passed. Browser tests passed against both the candidate port and the production LAN URL.
- After production verification, deleted the legacy database and temporary builds. Verified all 132 local originals against imported checksums, then removed 131 files totaling 4,050,597,129 bytes. Only `data/raw/nps-20260923.csv` remains; the source table and history download manifest are preserved. The local audit is `data/db/compaction-report.json`.

## Historical Backfill And Statistics

- The official portal exposes 129 historical files plus the latest file. Backfill completed successfully: 129 files imported and one already-imported latest file skipped by checksum. The 130 committed snapshot months cover November 2015 through August 2026.
- `npm run sync:nps-history` discovers official metadata, downloads compressed CSVs, resumes from a local manifest, and records failed files without partially importing them. `npm run history:start-job` provides a one-shot backfill worker. Ongoing month-end collection is now registered with `npm run sync:start-job`; see Month-End Collection below for the active schedule.
- Streaming CSV validation stages rows in a temporary SQLite table. Duplicate workplace rows are grouped with null-preserving sums, then company-ordered bulk snapshot writes reduce index churn. Older months and older same-month publications cannot overwrite newer metadata.
- Statistics live in `monthly_statistics`, keyed by month with a canonical source file ID. Each successful import regenerates that month inside the same transaction. Industry and size distributions are persisted as typed JSON. `npm run stats:rebuild` explicitly rebuilds all available months; page requests never calculate population aggregates.
- Only registered groups (`subscription_status_code = '1'`) contribute to active group counts, subscriber/acquisition/loss totals, and distributions. Subscriber totals count subscriptions, not unique people. Missing subscriber values are counted separately and excluded from sums. Industry rankings exclude unknown/multiple-industry labels.
- Snapshot industry is stored per month, preventing historical industry counts from using current company metadata. Same-month revisions select the newest publication date, with ID as tie-breaker, rather than duplicating months or summing revisions.
- Company history queries use `(company_id, snapshot_month DESC, id DESC)` and return all available canonical months. Charts fill missing calendar months with null gaps, support 1-year/3-year/all ranges, and expose underlying monthly rows. No fuzzy name/address merging is performed.
- Unit tests include legacy gzip import, chronological metadata protection, canonical revision selection, precomputed statistics, duplicate compressed checksums, missing-month behavior, search-index synchronization, compact migration, and safe raw-file pruning. Fourteen unit tests pass. Five Chrome browser tests cover search/navigation, pending state, shortcut/input synchronization, desktop/mobile chart rendering, colored canvas pixels, controls, and layout overflow.

## Search And UI Update (2026-10-10)

- Refined the search area with an integrated icon/button field, pending state, structured company shortcuts, compact dataset date/provenance, and a smaller estimate caveat. Next Form provides client-side search navigation. Shortcut navigation resets the input to the new query.
- Updated header, typography, statistic bands, distributions, and company result rows. Result metrics are unframed rather than nested cards. Verified screenshots at 1280px and 390px, with no horizontal overflow.
- Full history contains 4,519,408 workplace identities. The covering-index substring scan took about 42 seconds. Added an external-content SQLite FTS5 trigram index, generated explicitly with `npm run search:rebuild`, with insert/update/delete triggers to maintain consistency. Index generation is transactional, not part of page rendering.
- Three-character and longer queries use FTS. Short name queries use indexed prefix ranges if those matches fill the result page; otherwise the original substring scan remains. Broad/short queries can still cost more than specific company names.
- Post-index direct samples: Samsung 525ms, Naver 314ms, Hyundai Motor 864ms, no-match query 4ms. A repeated LAN production sample returned Samsung search in 0.229s, home in 0.059s, and detail in 0.105s. These are local measurements with warm caches, not cold-start guarantees; the first HTTP search sample took 3.48s while other work was running.
- Production builds now use `next build --webpack` on this resource-constrained Mac. Turbopack builds stalled under severe host memory pressure; Webpack compilation completed in 32.5s. Next.js remains 16.4.0.
- Production build, type checking, 12 unit tests, and all four browser tests pass. Browser tests were repeated after the real search index completed.

## Import Command

Expected usage:

```bash
npm run import:nps -- data/raw/<file.csv>
```

The importer validates these required 국민연금 columns:

- `자료생성년월`
- `사업장명`
- `사업자등록번호`
- `사업장가입상태코드`
- `사업장도로명상세주소`
- `사업장지번상세주소`
- `사업장업종코드명`
- `가입자수`
- `당월고지금액`
- `신규취득자수`
- `상실가입자수`

Company identity uses a complete 10-digit `사업자등록번호` when available. The official September 2026 file only exposes six digits, so masked numbers are not treated as unique IDs. For masked or missing numbers, identity uses normalized company name and address, plus the exposed registration prefix when present. These are workplace groups rather than verified legal-company identities.

The importer supports UTF-8 and EUC-KR, accepts the official `사업장가입상태코드 1 등록 2 탈퇴` header, and streams the CSV instead of loading every row into memory. Rows with the same identity in one source file are aggregated: employee counts, billed amounts, joiners, and departures are summed before estimating salary. Conflicting industries are displayed as `복수 업종`. If any component is missing, its aggregate remains unknown. Any invalid row rolls back the complete import.

Estimated salary uses:

```text
estimated monthly salary = 당월고지금액 / 가입자수 / contribution rate for snapshot year
estimated annual salary = estimated monthly salary * 12
```

Rows with missing or zero employee count do not produce salary estimates.

The rate is 9% through 2025, 9.5% in 2026, then increases by 0.5 percentage points per year to 13% in 2033. See the [National Pension contribution rules](https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0016M0.do).

## Verification Status (2026-10-09)

- Dependency installation succeeds on macOS 15.7.9 with Node.js 24.20.0.
- Updated `better-sqlite3` to 13.0.3, which ships N-API prebuilt binaries, after reproducing a Node 24 / 11.x garbage-collection crash in the real Next.js server.
- All nine tests pass, covering search, latest snapshots, encoding, aggregation, salary rates, duplicate imports, and atomic rollback.
- `npm run build` succeeds, including TypeScript checking.
- Fixed name-only searches matching all companies with registration numbers.
- Prioritized exact and prefix name matches so construction sites mentioning a company do not crowd it out of the limited search results.
- Updated Next.js external package configuration to `serverExternalPackages`.
- Production home, Samsung search, and detail pages return HTTP 200 and display imported values. Twelve repeated detail requests complete without the old native crash. SQLite foreign-key checks report zero violations.
- Updated Next.js to 16.4.0 and React to 19.3.0. Development and production builds now use Turbopack. The obsolete `next lint` script was replaced with `npm run typecheck`.
- `npm audit` reports zero vulnerabilities. Next.js supplies patched PostCSS directly, so the previous PostCSS override is no longer needed.
- Reproduced the reported hydration warning by injecting Trancy's `trancy-ko` class onto `<html>` before hydration. Added `suppressHydrationWarning` only to the root element to tolerate extension-added attributes; descendant hydration mismatches are not suppressed.
- Browser navigation tests wait for rendered chart readiness before navigating back. They do not wait for every RSC/prefetch stream to close, as a usable production page can retain an open stream.
- The browser regression test covers company search, detail values, and return navigation in clean Chrome over the LAN URL. The Trancy attribute simulation test was removed; extension-added root attributes are simply tolerated. Type checking also passes.

## Local Performance (2026-10-09)

- The original home query joined and sorted latest snapshots across 590,848 workplaces before applying the result limit. Direct database timings were about 2.54 seconds for home and 0.86 seconds for Samsung search; a LAN development request took 5.10 seconds for home.
- Added indexes for name ordering, covering substring search, snapshot-month enumeration, and latest snapshot selection including the ID tie-breaker. Home selects limited name-ordered candidates per latest month before fetching values. Search scans the smaller covering index and joins only matching IDs. Ordering and substring/registration search semantics are preserved.
- After index creation, direct DB measurements were 153-166 ms for home and 317-392 ms for Samsung search. Initial index creation took about 16 seconds once and does not repeat on subsequent reads.
- LAN access now uses `npm run build` followed by `npm run start -- --hostname 0.0.0.0 --port 3100`, not the development compiler. Three sequential warm HTTP measurements were 226-404 ms for home, 394-432 ms for search, and 47-72 ms for detail. Initial post-start requests were slower (home 1.15 seconds and search 0.88 seconds).
- Regression tests cover latest-month ordering, same-month revisions, missing snapshots, limited results, and index-backed latest snapshot selection without a temporary sort.
- Production build, type checking, all nine original unit tests, and LAN Chrome navigation verification passed after the query optimization. Browser tests accommodate production prefetching rather than waiting for a new request on every click.

## Official Dataset

- Source: [National Pension workplace data on data.go.kr](https://www.data.go.kr/data/15083277/fileData.do).
- Published file: `국민연금공단_국민연금 가입 사업장 내역_20260923`.
- Snapshot month inside the CSV: `2026-08` (distinct from the publication date).
- Original encoding: EUC-KR.
- Raw rows: 591,028.
- Imported workplace groups / snapshots: 590,848. The remaining 180 rows were aggregated into matching groups.
- SHA-256: `d9c12a9401c031b5dc1ee0c64553ddffa53e8a7e36681d12d4c7f72fd1b89602`.
- Downloaded local file: `data/raw/nps-20260923.csv`.
- Portal attachment ID: `FILE_000000007692952`, detail `1`.
- The source includes registered and withdrawn workplaces. Counts are National Pension subscribers, not exact HR headcounts.
- The file publishes corporations with at least three subscribers and individual workplaces with at least ten subscribers under the post-July 2025 disclosure rules. Smaller workplaces may be absent.

Raw data and the SQLite database are ignored by git. A fresh checkout needs to download the source and run `npm run import:nps -- data/raw/nps-20260923.csv` locally.

## Previous OS Blocker

Dependency installation was attempted on this machine and failed after registry access succeeded.

The failing package was `esbuild`, during its native binary validation step:

```text
dyld: Symbol not found: _SecTrustCopyCertificateChain
Referenced from: node_modules/esbuild/bin/esbuild
which was built for Mac OS X 12.0
Expected in: /System/Library/Frameworks/Security.framework/Versions/A/Security
```

This points to a local macOS version compatibility issue with the downloaded `esbuild` binary, not an application-code error.

## Local Commands

Install dependencies, verify, and start the app:

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

The browser regression test requires the imported September 2026 dataset and a running server. It covers search/detail navigation in a clean browser:

```bash
npm run dev -- --hostname 0.0.0.0 --port 3100
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' PLAYWRIGHT_BASE_URL=http://192.168.29.47:3100 npm run test:browser
```

Alternatively, install Playwright's Chromium with `npx playwright install chromium` and omit the executable-path environment variable. The default test URL is `http://127.0.0.1:3100`.

The previous `esbuild` OS compatibility error no longer occurs on this machine.

## Data Caveat

All UI salary language is framed as `국민연금 기반 추정치`. The values are not exact payroll data because National Pension reporting has income caps, eligibility rules, and reporting limitations.

## Link Previews

- Home and company detail pages provide Open Graph and Twitter large-image metadata, Korean descriptions, and canonical URLs rooted at `https://companylens.ersione.com` (never request Host or LAN addresses).
- Company previews include the company name, available snapshot month, subscriber count, and estimated annual salary, with the National Pension estimate caveat. Raw file provenance is not exposed.
- A shared 1200 by 630 PNG at `/opengraph-image` is generated during the production build; it does not query SQLite or fetch external fonts when a messenger requests it.
- The Next.js 16 HTML-limited bot list is preserved and extended for Kakao agents, ensuring metadata is sent in the initial head. Normal browsers retain metadata streaming.
- Company metadata and page content reuse a React request-local cached detail lookup, not a cross-request data cache.
- Verification: `tests/social-metadata.test.ts` and `tests/browser/social-metadata.spec.ts` cover missing values, caveats, canonical URLs, Slack/Kakao HTML, missing-company status, and PNG dimensions. Existing messenger previews may remain cached until the platform refreshes them.
- Production build and typecheck passed; all 31 unit tests and 12 browser tests passed. The two preview browser tests also passed against the public HTTPS domain after deployment. This verifies crawler HTML and image delivery, not a real message send inside Slack or KakaoTalk.

## Remote Main Integration And Search Filters

- Integration starts from remote main `d15cfb3`, retaining the preceding five commits without rewriting history. The pre-integration staged changes are backed up locally in ignored `data/pre-integration.patch`.
- Keep the production compact schema v2, canonical monthly snapshots, current import/statistics/benchmark pipeline, trigger-maintained FTS index, Chart.js, typography, API, and social metadata. No production DB conversion or data reload is required.
- Retain MIT licensing/source attribution, the favicon, industry display cleanup, and explicit busy timeout from remote main. Remove the superseded Recharts component, static source manifest and old downloader/sync/index scripts instead of exposing two incompatible workflows.
- Search now supports region, minimum subscriber count, relevance/subscriber sorting, and previous/next pages in both web and API. Web pages contain 20 results; API keeps its existing default 5/max 20. Filters precede pagination, use canonical latest values, and sort ties end with company ID. All conditions are retained in URLs; form submissions reset pagination.
- Region matches representative company addresses, including historical Gangwon/Jeonbuk labels. Empty addresses cannot match a selected region. Missing subscriber counts fail a positive minimum filter and sort last for subscriber sorting.
- One extra row determines `hasMore`; no full-result count query is added. Page is capped at 1000, minimum subscribers at 10000000. At the cap, refine the query. API contract is 1.1.0; existing q/limit calls remain supported. Unknown or repeated API parameters and invalid web/API options are rejected before search.
- Candidate verification: 35 unit/contract tests and 14 Chrome browser tests passed, including canonical revisions, stable pagination, region aliases, combined filters, no duplicate rows, URL reload/back behavior, and mobile layouts at 1280/390/320px.
- Final production build/typecheck and all 14 browser tests passed after compacting mobile shortcut labels. Public HTTPS probes verified combined filters, distinct first/second pages, 400/no-store for an invalid page, OpenAPI 1.1.0, and persisted web selections. The application error log remained empty.
- Alternating warm HTTP probes (three measured requests per company, same host/dataset) compared the previous and candidate APIs: Samsung 163-248 ms vs 144-175 ms; Naver 43-46 ms vs 55-74 ms; Hyundai Motor 50-76 ms vs 44-50 ms. These are representative searches, not a guarantee for broad terms or cold-cache performance.

## Latest-Company Search Projection

- Added `company_latest`, keyed by company ID and containing only latest canonical snapshot IDs/months and numeric metrics. FTS candidate discovery is unchanged; nonempty web/API searches now join this projection by primary key. Detail/history queries retain their indexed history access.
- The previous search did not sequentially scan all snapshots: it performed one indexed latest-snapshot lookup per candidate. The new search removes those repeated history lookups entirely. Sorting still uses a temporary B-tree; no unnecessary address/employee indexes were added to the large history table.
- `npm run search:refresh-latest` builds the projection atomically with a readiness marker. Queries fall back to the previous indexed path until ready. Initial construction is batched in company-ID order to avoid random traversal via the company-name index. Interrupted/failed builds preserve the previously committed projection.
- CSV import/statistics updates refresh all affected companies in the same transaction, including every source revision of the month so omitted companies can fall back to an older canonical snapshot. Older imports cannot overwrite newer metrics. Direct SQL snapshot/source-selection edits and DB compaction/replacement require running the rebuild command again.
- The production projection contains 4,519,408 rows, took 266 seconds to build, and occupies 131,461,120 bytes (125.4 MiB), plus one 4 KiB readiness page. No raw sources or historical snapshots were removed or reimported.
- All 36 unit/contract tests passed, including cached/fallback search parity, region aliases, ordering/pages, absent snapshots, null values, revisions/omissions, deletion, and transactional import/rebuild rollback. All 14 Chrome browser tests passed with the projection ready, including API, filters/pages, details/history, hydration, link previews and typography.
- Read-only production-data diagnostics compared old/new paths across nine query/option combinations and found identical results. The actual new query plan uses FTS5 and primary-key lookups only, plus sorting, with no `company_snapshots` access. Measured timings are cache- and host-load-dependent; no forced cold-cache guarantee is made.
- After builds/browser tests finished, alternating read-only queries (one warm-up plus five measured samples per path) gave median DB-only times of Samsung 134 -> 65 ms, Hyundai Motor 41 -> 17 ms, and automotive/subscriber sorting 175 -> 82 ms. Every compared result was identical. These measurements exclude HTTP/rendering and are not a cold-cache test.
- The final default production build and typecheck passed. The launchd-managed service was restored on port 3100 after serving the validated candidate during the build; its error log remained empty. Public filtered API pages matched local responses with no duplicate IDs, and public search HTML returned HTTP 200.

## Month-End Collection

- Official source metadata checked on 2026-10-11 declares monthly updates and the next registration date as 2026-10-26: https://www.data.go.kr/data/15083277/fileData.do . Generation after the qualification deadline on the 15th is not a guarantee of same-day portal publication.
- Registered `com.ersione.company-lens-sync` as a user LaunchAgent, replacing the inactive one-shot history agent. Primary collection is the last day at 04:00 KST, with incomplete-run retries on days 1-3 and login catch-up. Calendar triggers on days 28-31 are gated by KST month-end logic; completed publication months exit before portal access. The next primary run is 2026-10-31 04:00 KST.
- Added dry-run discovery, persistent success/failure status, strict CLI validation, and shared sync/manual-import advisory locking with dead-owner recovery. Known checksums survive raw pruning and current-to-history number changes. Five legacy manifest records without checksums are resolved only through an unambiguous existing source filename/month match rather than downloading them again.
- Imports keep atomic monthly statistics, benchmarks, latest-company metrics and FTS trigger updates. Complete successful syncs checksum-verify raw sources and retain only the latest original, including gzip files. Failed/incomplete imports do not prune. Missing expected publication months remain incomplete for retry; no external notifications are configured.
- The installed agent completed its initial catch-up successfully: 130 official entries, zero pending/imported files, one verified retained original `data/raw/nps-20260923.csv`, no errors. The web LaunchAgent and production build were not changed by collector registration.
- Added tests for leap years, KST hour/month/year boundaries, 30/31-day months, live/stale owner locks, dry-run nonmutation, legacy checksum recovery, history rollover, incremental cache refresh, repeat skips and failed-import raw preservation. All 39 unit/contract tests, source-only production candidate build and final typecheck passed. Re-registering was idempotent; a second launchd execution skipped the already completed month without discovery and exited 0. Public status remained HTTP 200.

## Final Pre-Push Verification

- Rechecked documentation against the active collector: removed superseded no-monthly-timer statements, clarified the public minimum search length and internal fallback, and updated the changelog with latest-company metrics and month-end collection.
- Reran all 39 unit/contract tests and all 14 Chrome browser tests successfully. A separate production build passed without replacing the running server build. `npm audit --omit=dev --audit-level=high` reported zero vulnerabilities.
- Verified installed calendar entries, scheduled/prune arguments, ready latest-company metrics, FTS/statistics/benchmark tables and an empty importer lock table. Both local and public status endpoints returned HTTP 200 with the expected latest month.
- Staged-file checks excluded raw data, databases and environment files; a narrow private-key/token-pattern scan found no candidates. Existing remote history is preserved and local main can advance by fast-forward without a force push.

## Company Research Expansion (2026-10-11)

- Added a shareable `/compare` view for up to three workplaces, search/add/remove controls, explicit per-workplace months and a warning for different months. Comparisons retain nulls and do not claim to compare whole corporations.
- Added subscriber and estimated-salary changes against exactly twelve months earlier, plus a maximum twelve-month contiguous subscriber trend. Missing months/counts break the streak, zero denominators do not produce percentages, and the same helper powers web and API.
- Added `industry_statistics`, keyed by industry and guarded by canonical month/source. Medians are precomputed atomically with existing benchmarks at import time, independently requiring 30 employee/salary samples. Provisioned 866 industry rows on the current database with the shared import lock; the lock was released after success. Requests do not calculate industry-wide aggregates. A sampled production query took approximately 27 ms including connection/migration overhead; this is not a latency guarantee. The actual plan uses the benchmark PK, snapshot source/company/month index and industry/monthly-statistics PKs, with no history scan.
- Added indexed `company_name_observations` for names collected during future imports. Existing historical names cannot be reconstructed, observation month ranges are not legal rename dates, and masked-number renamed identities are never automatically stitched. Similar-name workplaces are bounded FTS search candidates, explicitly not confirmed corporate relationships.
- Added unauthenticated read-only `/api/v1/compare` and `/api/v1/companies/{id}/insights`, with strict ID/query validation and OpenAPI 1.2.0 contracts. Existing detail/history contracts remain unchanged. API reference and README describe cohort, date, identity and missing-value semantics.
- Verified the latest retained raw CSV has 22 columns and no large-company/SME/venture classification. Its corporation/individual code is not enterprise size. No inferred legal classification or new external source integration was added.
- Updated the home headline, OG/Twitter metadata and preview image to "숫자로 보는 회사". Unit/API contract tests passed (45 total); browser regression coverage includes comparison actions, medians, summaries and mobile layouts in addition to existing search/charts/previews.
- Monthly collection registration, raw retention and existing histories were not changed. No bot deployment, DNS/ingress changes, or automatic Git commit was performed.
- Final production build and default typecheck passed. All 16 browser tests passed against the final isolated build; two expansion tests passed again with explicit 320/390px horizontal-scroll reachability checks. Desktop/mobile screenshots were inspected. Activated the validated build on the existing launchd service and verified public comparison HTML, both new APIs and OpenAPI 1.2.0 (HTTP 200); the web error log remained empty. Removed the temporary candidate/previous build directories after verification.
