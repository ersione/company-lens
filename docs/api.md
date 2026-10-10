# Company Lens API v1

## Access

- LAN base URL: `http://192.168.29.47:3100` (address may change with the host network).
- Browser reference: `/api-docs`.
- Machine-readable OpenAPI 3.0.3: `/api/openapi.json`, generated from `lib/openapi.ts`.
- No API key or authentication. Read-only GET endpoints; no imports or administration endpoints.
- Public deployment target: `https://companylens.ersione.com` for both the UI and API.
- A same-host bot should use configurable `COMPANY_LENS_URL=http://127.0.0.1:3100` for API calls and a separate `COMPANY_LENS_PUBLIC_URL=https://companylens.ersione.com` for user-facing links. These are integration settings, not a bot deployment in this repository.
- No cross-origin browser CORS permission is enabled. Server-to-server bot requests do not need CORS.

## Endpoints

| GET path | Parameters | Purpose |
| --- | --- | --- |
| `/api/v1/companies` | Required `q`; optional `limit` (default 5, max 20), `page`, `region`, `minEmployees`, `sort` | Search company names or publicly available registration numbers |
| `/api/v1/companies/{id}` | Positive safe-integer ID | Latest company values, previous calendar month comparison, cached benchmarks |
| `/api/v1/companies/{id}/history` | Optional `from`, `to` (YYYY-MM), `limit` (default/max 240) | Canonical monthly history, ascending |
| `/api/v1/status` | None | Latest source month, source row count, import time |

Search trims `q` and requires 3-100 Unicode characters including a letter or number. `%`, `_`, and control characters are rejected. Numeric searches must still contain at least three digits after whitespace/hyphen removal. This keeps short searches away from the large substring-scan fallback. The search index must be provisioned before exposure (`npm run search:rebuild`); the production database already has it.

The web `/?q=` route uses the same validation before calling company search, including duplicate `q` rejection. Invalid input displays a form error without querying company results. Only the web landing page permits absent/empty/space-only input as a non-search state; the API requires a search term. Control characters are rejected even at the ends of otherwise valid input.

Unknown and duplicate query parameters are rejected with 400. IDs and limits accept positive decimal integers only (no signs, leading zeros, fractions, exponent syntax). Bounds are enforced before database access. Month ranges are inclusive; `from > to` is invalid.

Success responses use `{ "data": ..., "meta": ... }`. `meta` contains source, source URL, currency, `salaryBasis: "국민연금 기반 추정치"`, and a caveat. Missing values are `null`, not zero. Money is integer KRW, headcounts are people, percentages are unrounded percent values (not fractions). `detailPath` is a relative path so callers can combine it with the configured site URL without trusting an incoming Host header.

Search returns `returnedCount`, `limit`, `hasMore`, `companies`, and the normalized `page`, `region`, `minEmployees`, `sort` conditions. `page` defaults to 1 and is bounded to 1-1000. Keep all conditions and `limit` unchanged when moving to the next page. There is no full-result total; `hasMore` comes from fetching one extra row. At page 1000, refine the search even if `hasMore=true`. Valid pages beyond the available results return an empty array. Results are stable within an unchanged dataset, not pinned across monthly updates.

`region` accepts the full Korean province/city names listed in OpenAPI. Omitted/empty means all; Gangwon/Jeonbuk also match older province names. Filtering uses the representative address (unknown addresses do not match a selected region). `minEmployees` is 1-10000000 or omitted/empty for no threshold; it applies to the latest canonical snapshot, excludes missing counts when set, and is not exact HR headcount. `sort` is `relevance` (default) or `employees` (descending subscriber count, null last). All sort orders end with company ID to break ties. Filters precede pagination; a new search condition should reset `page=1`.

History returns `snapshots`, `returnedCount`, `limit`, and `hasMore`; continue with `from` set to the month after the last returned month. Empty history ranges return 200 with an empty list for an existing company. Missing calendar months are omitted, not synthesized as zero.

The detail response excludes raw file names, internal paths, and internal source IDs. A registration number may be partially published/masked. `comparison` uses only the immediately previous calendar month; absent values or previous salary zero yield null changes. `netSubscribers` is acquisitions minus losses, not headcount change or actual hires minus departures.

`benchmark` is nullable and applies only to eligible active workplaces in the latest cached canonical statistics month. Top percentages include ties (smaller is higher); salary comparisons require positive estimates. Unknown industries or cohorts below 30 valid observations have null industry top percentages. Raw percentiles must not be rounded down in bot text in a way that implies a higher rank.

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
