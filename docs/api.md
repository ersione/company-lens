# Company Lens API v1

## Access

- LAN base URL: `http://192.168.29.47:3100` (address may change with the host network).
- Browser reference: `/api-docs`.
- Machine-readable OpenAPI 3.0.3: `/api/openapi.json`, generated from `lib/openapi.ts`.
- No API key or authentication. Read-only GET endpoints; no imports or administration endpoints.
- Public deployment target: `https://companylens.ersione.com` for both the UI and API.
- A same-host bot should use configurable `COMPANY_LENS_URL=http://127.0.0.1:3100` for API calls and a separate `COMPANY_LENS_PUBLIC_URL=https://companylens.ersione.com` for user-facing links. These are integration settings, not a bot deployment in this repository.
- No cross-origin browser CORS permission is enabled. Server-to-server bot requests do not need CORS.
- Backend [usage metrics](usage-metrics.md) aggregate origin API calls, valid normalized/redacted search terms, successful detail views by subscriber size, handler latency and HTTP errors for 90 days. No IP/client identifiers are stored. Cached edge responses are not counted; metrics/reporting remain operator-local and are not additional public endpoints.

## Endpoints

Broad name/number searches are rejected with `400 INVALID_REQUEST` when the pre-filter candidate set exceeds 20,000. The guard reads at most 20,001 index matches before any latest-snapshot joins, materialization, sorting or pagination. Narrow the company name/public number; reducing `limit`, changing `page` or adding region/size filters does not bypass this safety limit. Web search and comparison show actionable errors; optional similar-name suggestions return no candidates instead of failing the detail page. This protects the synchronous SQLite request path, not a general request-rate or execution-time limit.

Search omits daily-worker records with latest canonical count exactly 0 regardless of month: name markers `(일용)`, `(일용직)`, `/일용/`, `-일용-`, `[일용]`, accepting full-width parentheses. Zero-count workplaces with only one canonical observation month are also omitted regardless of age; superseded source revisions do not count as additional observations. Other zero-count workplaces are omitted if last observed at least 12 months behind the latest canonical dataset month (fallback: latest imported source month). This also applies to insights `relatedCandidates`, but not `recordCandidates`. Positive/unknown counts and recent ordinary zero counts with multiple canonical months remain eligible. Detail/history endpoints still expose the preserved record; exclusion does not establish closure. The age cutoff advances with imported data, not the server clock, and all exclusions apply before pagination.

| GET path | Parameters | Purpose |
| --- | --- | --- |
| `/api/v1/companies` | Required `q`; optional `limit` (default 5, max 20), `page`, `region`, `minEmployees`, `sort` | Search company names or publicly available registration numbers |
| `/api/v1/companies/{id}` | Positive safe-integer ID | Latest company values, previous calendar month comparison, cached benchmarks |
| `/api/v1/companies/{id}/history` | Optional `from`, `to` (YYYY-MM), `limit` (default/max 240) | Canonical monthly history, ascending |
| `/api/v1/companies/{id}/insights` | Positive safe-integer ID | Employment summary, cached industry medians, observed names, similar-name candidates |
| `/api/v1/compare` | Required `ids`, comma-separated 2-3 distinct positive safe integers | Latest workplace comparison, benchmarks and year-over-year changes |
| `/api/v1/status` | None | Latest source month, source row count, import time |

Search trims `q` and requires 3-100 Unicode characters including a letter or number. `%`, `_`, and control characters are rejected. Numeric searches must still contain at least three digits after whitespace/hyphen removal. This keeps short searches away from the large substring-scan fallback. The search index must be provisioned before exposure (`npm run search:rebuild`); the production database already has it.

The web `/?q=` route uses the same validation before calling company search, including duplicate `q` rejection. Invalid input displays a form error without querying company results. Only the web landing page permits absent/empty/space-only input as a non-search state; the API requires a search term. Control characters are rejected even at the ends of otherwise valid input.

Unknown and duplicate query parameters are rejected with 400. IDs and limits accept positive decimal integers only (no signs, leading zeros, fractions, exponent syntax). Bounds are enforced before database access. Month ranges are inclusive; `from > to` is invalid.

Success responses use `{ "data": ..., "meta": ... }`. `meta` contains source, source URL, currency, `salaryBasis: "국민연금 기반 추정치"`, and a caveat. Missing values are `null`, not zero. Money is integer KRW, headcounts are people, percentages are unrounded percent values (not fractions). `detailPath` is a relative path so callers can combine it with the configured site URL without trusting an incoming Host header.

Search returns `returnedCount`, `limit`, `totalCount`, `totalPages`, `hasMore`, `companies`, and the normalized `page`, `region`, `minEmployees`, `sort` conditions (OpenAPI 1.5.0). `totalCount` counts matching workplaces after all visibility/region/subscriber filters; `totalPages` is `ceil(totalCount / limit)` and is 0 for no matches. Count and list queries share predicates and one read transaction; totals are not cached in the application. `hasMore` is `page < totalPages`. `page` defaults to 1 and is bounded to 1-1000, even when `totalPages` exceeds that limit. Keep all conditions and `limit` unchanged when changing pages. At page 1000, refine the search even if `hasMore=true`. Valid pages beyond the available results return an empty array with unchanged totals. Results are stable within an unchanged dataset, not pinned across monthly updates.

`region` accepts the full Korean province/city names listed in OpenAPI. Omitted/empty means all; Gangwon/Jeonbuk also match older province names. Filtering uses the representative address (unknown addresses do not match a selected region). `minEmployees` is 1-10000000 or omitted/empty for no threshold; it applies to the latest canonical snapshot, excludes missing counts when set, and is not exact HR headcount. `sort` is `relevance` (default) or `employees` (descending subscriber count, null last). All sort orders end with company ID to break ties. Filters precede pagination; a new search condition should reset `page=1`.

History returns `snapshots`, `returnedCount`, `limit`, and `hasMore`; continue with `from` set to the month after the last returned month. Empty history ranges return 200 with an empty list for an existing company. Missing calendar months are omitted, not synthesized as zero.

The detail response excludes raw file names, internal paths, and internal source IDs. A registration number may be partially published/masked. `comparison` uses only the immediately previous calendar month; absent values or previous salary zero yield null changes. `netSubscribers` is acquisitions minus losses, not headcount change or actual hires minus departures.

`benchmark` is nullable and applies only to eligible active workplaces in the latest cached canonical statistics month. Top percentages include ties (smaller is higher); salary comparisons require positive estimates. Unknown industries or cohorts below 30 valid observations have null industry top percentages. Raw percentiles must not be rounded down in bot text in a way that implies a higher rank.

OpenAPI contract version 1.4.0 includes record candidates and extends insights with exact 36-month employment changes,
complete trailing-12-month acquisition/loss totals, and a cached `sizeCohort` comparison.
The existing detail response is unchanged. `sizeCohort` groups active workplaces by the
latest canonical month's industry and subscriber band: 1-9, 10-49, 50-299, 300-999, 1000+.
These are not legal enterprise-size classifications. Each metric requires 30 valid observations.
Growth medians use the same workplace identity in the canonical month exactly one year earlier,
with positive active subscribers at both endpoints. Missing/zero baselines yield null, not zero growth.
The target workplace is included in the cohort. Historical workplaces and stale/unbuilt caches
return `sizeCohort=null`. Missing movement months/values yield null totals, never partial totals.
Totals are monthly acquisition/loss counts, not unique people or actual hires/departures.
`employment` uses exactly twelve calendar months earlier, not the nearest available row. Missing counts/zero denominators yield null percentages. A year-over-year absolute count difference can still be calculated from a zero starting count. `consecutiveMonths` is capped at 12 comparisons ending at the latest company month; gaps or missing counts stop the streak. It describes pension subscribers, not recruitment or attrition.

`industry` is cached only for the latest canonical month and eligible active workplaces. Employee medians use positive subscriber counts, salary medians use positive estimates. Both require at least 30 valid samples independently. Even-sized samples average their two central values, so medians and differences can be fractional; unlike individual salary estimates, these aggregates are not guaranteed integer KRW. Updates are atomic with benchmarks during imports. Provision on an existing database once with `npm run benchmarks:rebuild`; never compute full-industry medians from a request.

`observedNames` returns up to 30 collected names ordered by last seen month descending. It starts accumulating with imports after this feature is installed; existing historical names cannot be reconstructed from this database. First/last observation months are not legal rename dates or continuous periods. A noncanonical source revision can still contribute a collected name. Partial/missing registration numbers do not permit joining renamed identities. Similar-name candidates (max 6) are text-search results, never confirmed same-corporation/group relationships.

`recordCandidates` returns up to 6 earlier/later record links without merging identities or histories. Candidates require an exact nonempty public registration number and representative address, similar names (at least 3 shared character trigrams and Dice score >= 0.5 after corporate-form normalization), and adjacent nonoverlapping canonical observation ranges. `firstMonth`/`lastMonth` are observations, not legal rename dates or proof of continuous operation. `direction` is `earlier` or `later` relative to the requested workplace. Partial public numbers and road-level addresses are not unique: this is only a candidate relationship. Uses the provisioned FTS index and per-company history index; returns no candidates when FTS is absent or more than 50 number/address matches exist. No new collection or index rebuild is needed.

`compare` preserves the requested ID order and rejects duplicates, whitespace, excess IDs or unsupported parameters. Missing any company returns 404 for the whole request. Each company retains its own latest month; `sameSnapshotMonth=false` means the values are not contemporaneous. Nulls and valid zeros remain distinct. The shareable web view `/compare?ids=...` also permits one selected workplace while choosing the rest.

## Examples

```bash
export COMPANY_LENS_URL=http://192.168.29.47:3100
curl -G "$COMPANY_LENS_URL/api/v1/companies" \
  --data-urlencode 'q=삼성전자' --data 'limit=5'
curl -G "$COMPANY_LENS_URL/api/v1/companies" \
  --data-urlencode 'q=삼성전자' --data-urlencode 'region=경기도' \
  --data 'minEmployees=50' --data 'sort=employees' --data 'page=1' --data 'limit=20'
curl "$COMPANY_LENS_URL/api/v1/companies/177744"
curl "$COMPANY_LENS_URL/api/v1/companies/177744/history?from=2025-01&to=2026-08"
curl "$COMPANY_LENS_URL/api/v1/companies/177744/insights"
# Substitute two real IDs selected from search:
curl "$COMPANY_LENS_URL/api/v1/compare?ids=177744,177745"
curl "$COMPANY_LENS_URL/api/v1/status"
```

## Errors And Caching

Errors use `{ "error": { "code": "...", "message": "..." } }`:

- 400 `INVALID_REQUEST`: validation failure.
- 404 `COMPANY_NOT_FOUND`: valid ID, missing company.
- 500 `INTERNAL_ERROR`: generic client message; diagnostics stay in server logs.
- Unsupported methods receive the framework's 405 response (not the JSON error envelope).

Success data is cacheable for 60 seconds; the specification for 300 seconds. Errors use `Cache-Control: no-store`. No application-level rate limiting is implemented. Public exposure must include an edge request limit; input limits alone do not protect the synchronous SQLite/Node process from request floods. Cache configuration is permission to cache, not a guarantee that a proxy is caching.

## KakaoTalk Integration Contract

1. Search using the user's company name; do not silently pick the first of several workplaces.
2. For a selected ID, retrieve detail; only retrieve history when requested.
3. Format salary from KRW to 만원 for display, preserve null as unavailable, and include 기준월 and 국민연금 기반 추정치.
4. Combine `detailPath` with `COMPANY_LENS_PUBLIC_URL` for user links, not the private API base. Enforce client timeouts and handle 400/404/500 separately; never expose internal error logs in chat.

Bot implementation, DNS, and public tunnel changes are outside this API change.

## Infrastructure Handoff

- Current origin: host LAN address above, port 3100, launchd `com.ersione.company-lens-web`; keep the origin behind the existing managed ingress.
- Public deployment target: `companylens.ersione.com`, using lowercase spelling. The infrastructure session owns DNS/Tunnel/nginx/edge request limits and external deployment verification; this app change does not create or certify those settings. Planned ingress preserves `/api/*` paths and query strings. A separate API hostname is unnecessary for this MVP.
- Before public exposure: confirm hostname ownership/collisions, route HTTPS ingress to the origin, configure edge rate limits (especially search), verify cache/query-string isolation, and run external HTTP/API probes.
- Keep `data/`, SQLite, import commands, Next development server, and administration interfaces private. Do not expose a database/file-server port.
- No authentication by user request. Reassess abuse controls before widening access. Do not enable permissive CORS without a browser-client use case.
- API docs and OpenAPI use relative paths, so no domain-dependent application rebuild is required.
