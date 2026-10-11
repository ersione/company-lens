# Service Usage Metrics

## Collection

Metrics are generated on the backend; there is no client analytics script, beacon, cookie or public metrics endpoint. Web pages query the business database directly, so their handlers and external API handlers are observed separately. Browser-local recent workplace history is not read or uploaded.

`next/server`'s `after()` persists aggregates after the response. Metrics use a separate `data/db/usage-metrics.sqlite` (override with `METRICS_DATABASE_URL`), not the pension database. Collection failures do not change responses; SQLite lock waits are limited to 25ms, and a generic warning is throttled to once per minute. A process crash before `after()` completes can lose a count. Set `METRICS_DISABLED=1` to disable collection.

## Recorded Data

- KST daily request counts by `web` / `api`, operation, HTTP status and latency bucket.
- Initial home, search, detail and comparison page-handler executions. Metadata and nested DB calls do not add views. Known bot user agents and prefetch headers are excluded from web counts; headers are inspected transiently, not stored. Bot detection is heuristic, not a security boundary.
- API search, detail, history, insights, comparison and status calls. Status/health checks are a separate operation and must not be added to user visits. API bot calls remain counted because chatbot integrations are intended clients.
- Search term trends, matched/empty/invalid/failed outcomes, first versus later pages. Comparison-page searches also contribute to web search trends. Counts are requests, not unique searches: paging/filter changes and repeated requests can add counts. Empty means zero total matches, not an out-of-range page of a nonempty result set.
- Successful detail views only: workplace ID, observed snapshot month and subscriber-size band at the time of the view. History/insight/comparison calls do not inflate detail popularity. Bands are `0`, `1-9`, `10-49`, `50-299`, `300-999`, `1000+`, `unknown`; these are not legal SME/large-enterprise categories.
- Average/max handler time and bucket-based p50/p95 upper bounds; 4xx counts and 5xx counts/rate are separate. A web validation message normally returns HTTP 200 and is instead identified by the search outcome. Timing covers handler work, not full React rendering, network latency or client loading. Errors occurring after a page handler returns, in metadata or outside these handlers are not captured; infrastructure monitoring remains necessary.

## Privacy, Bounds And Interpretation

No IP, user/session ID, full URL, referrer, user agent, raw error or per-request event log is stored. Unique visitors, sessions and funnels cannot be inferred. Browser navigation/cache restores that do not reach the backend are not counted; prefetch/render retries can still make counts differ from actual human views. Nginx/Cloudflare API cache hits also do not reach the backend. These are **origin-handled requests**, not complete traffic statistics. Existing Cloudflare RUM and infrastructure logs are separate systems.

Successful valid search terms are normalized (NFC, whitespace, lowercase). Numeric-only registration searches, contact/URL-like patterns and invalid/failed terms use aggregate redaction markers. This reduces accidental sensitive input but cannot guarantee that arbitrary free text contains no personal data. Do not expose search trends publicly.

Keep 90 KST calendar days; expired aggregates are deleted on the next collected event. SQLite can retain freed pages for reuse rather than shrinking the file immediately. Per day, at most 1,000 distinct search aggregate keys and 2,000 company aggregate keys are retained before new keys enter `[other]` / company ID `0` overflow buckets. Already tracked keys continue accumulating; overflow preserves size/month dimensions. Popularity tables report at most 100 groups. No historical usage is backfilled.

## Local Report

```sh
npm run metrics:report -- 30
```

Accepts 1-90 days, defaults to 30, prints JSON and opens the metrics database read-only. The report includes daily requests, search trends, popular workplaces, workplace-size breakdown and daily size trends. Workplace names are resolved from the current business database for readability; recorded size/month reflects the original observation, not today's size. Company ID `0` is the overflow bucket, not a workplace. `serverErrorRate` is a fraction (multiply by 100 for percent); percentile values are bucket upper bounds, not exact percentiles.

The CLI report/DB is operator-local. There is no unauthenticated dashboard/API exposing search terms. Copy only appropriate aggregates when sharing reports. Keep the metrics DB and its WAL/SHM files out of git and public file serving; existing `data/` ignore rules apply.

## Admin Access

Open `https://companylens.ersione.com/admin`. Unauthenticated requests receive a login form, not metrics; the check runs before reading data and applies to HTML and RSC navigation. Both the configured ID and password must match exactly. Neither is persisted in metrics. Authentication has no account/session database.

Server-only configuration in git-ignored project `.env` (restrict permissions to `600`):

- `ADMIN_USER_ID`: required administrator ID.
- `ADMIN_PASSWORD`: required password, preferably 16+ random characters.
- `COMPANY_LENS_ADMIN_SESSION_SECRET`: independent random signing secret, at least 32 characters; stored separately in `.env.local`.

Missing configuration fails closed. Never use `NEXT_PUBLIC_` for these values or commit them. Next.js loads the project environment files at startup; `.env.local` overrides `.env`, so do not keep conflicting credentials there. Restart the web service after changes. Rotating the ID, password or signing secret invalidates old sessions after restart. No credential values are documented in git.

Login/logout POSTs require the exact public HTTPS Origin. Local development permits loopback HTTP; an isolated production-mode test server additionally needs `COMPANY_LENS_ADMIN_ALLOW_LOCAL_HTTP=1`. Do not enable that flag on the public service. Next may normalize loopback URLs, so the opt-in check compares the incoming Host and Origin and permits only loopback hosts/ports. LAN HTTP Origins are not accepted. Login bodies are bounded to 4KiB; at most 20 attempts/minute are accepted per server process, globally, without IP storage. This basic guard is not distributed abuse protection and can temporarily limit all admins if someone exhausts it; use edge protections or proper identity-based authentication for a larger deployment.

Sessions last eight hours and use a signed, random-nonce cookie: HttpOnly, SameSite=Strict, host-only, Path=/admin, Secure on the public HTTPS origin. Tokens contain no password/username. Logout clears the browser cookie; this stateless temporary mode cannot revoke a copied individual token before expiry without rotating configuration. Public company APIs remain unauthenticated as before.

Admin responses are dynamic/private/no-store with noindex/noarchive and frame denial headers. Stats are server-rendered only after authorization; there is no new unauthenticated metrics JSON endpoint. Admin views do not count toward service usage.

Charts show daily web/API requests, top-five search trends plus a top-ten keyword table, top-ten successful workplace detail views, subscriber-size stacked trends/shares, weighted mean/p95 bucket upper processing times, and separate 4xx/5xx counts. Filters are recent 7/30/90 days and all/web/API. Status/health operations are excluded. Search popularity/empty rate uses valid first-page requests, excluding later pagination and invalid/failed searches; redacted/overflow terms are excluded from the keyword ranking but remain in search totals. Workplace ID 0 overflow is excluded from ranking but remains in size totals. Names are current company names; rank size/month is the most-viewed observed size/month, not necessarily today's size. No usage data is fabricated/backfilled; empty or failed reads are shown explicitly.

## Verification

Run `npm test`, `npm run typecheck`, an isolated production build, then:

```sh
METRICS_DATABASE_URL=/tmp/company-lens-metrics.sqlite NEXT_DIST_DIR=.next-usage-metrics npm run start -- --hostname 127.0.0.1 --port 3101
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 PLAYWRIGHT_METRICS_DATABASE_URL=/tmp/company-lens-metrics.sqlite npm run test:browser -- usage-metrics.spec.ts
```

The browser test compares aggregate deltas for real page/API requests, checks bot/prefetch exclusions and confirms there is no application usage POST. Unit tests cover KST boundaries, redaction, historical size bands, latency/error aggregation, retention, cardinality limits, deferred recording and fail-open behavior.

For administrator checks, build with `NEXT_DIST_DIR=.next-admin npm run build`, then start an isolated server with `COMPANY_LENS_ADMIN_ALLOW_LOCAL_HTTP=1 METRICS_DISABLED=1 METRICS_DATABASE_URL=/tmp/company-lens-admin-test.sqlite NEXT_DIST_DIR=.next-admin npm run start -- --hostname 127.0.0.1 --port 3101`. Run `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3101 npm run test:browser -- admin.spec.ts`. Tests read credentials from the ignored project environment files, or explicit `PLAYWRIGHT_ADMIN_USER_ID` / `PLAYWRIGHT_ADMIN_PASSWORD` overrides. Use `PLAYWRIGHT_ADMIN_EMPTY=1` only against a missing/empty isolated metrics file for the empty-state case. Keep local HTTP opt-in off in production. Authentication tests cover missing/wrong/duplicate credentials, credential rotation, expiry/tampering, origin rejection, cookie scope, logout and unauthenticated HTML/RSC isolation.
