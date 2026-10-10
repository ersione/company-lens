# Implementation Status

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
