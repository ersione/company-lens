# Company Lens

[한국어](README.ko.md) | English · [Service](https://companylens.ersione.com) · [API docs](https://companylens.ersione.com/api-docs)

Search Korean workplaces using National Pension Service public data: subscriber counts,
estimated salaries, employment history, industry/size benchmarks and up to three-workplace
comparisons. Includes browser-local recent visits and a protected usage dashboard.
Public monthly employment, industry and regional statistics include historical charts and annual summaries.
Industry employment changes compare 1, 3 or 12 months, with growth/decline rankings by headcount or rate at `/employment-trends`.

Search requires at least two characters and defaults to the latest loaded month, ordered
by subscriber count. Historical workplaces are opt-in; missing latest data does not imply closure.

Salaries are **National Pension-based estimates**, not actual payroll. Subscriber counts
do not establish legal company size; similar names do not establish company identity.
Explicit daily-worker workplaces (e.g. `/일용/`, `(일용)`, `건설일용관리`) are excluded during import.

**Stack:** Next.js, TypeScript, Tailwind CSS, SQLite/Drizzle, Chart.js. Requires Node.js 22+ and npm.

## Run

```sh
npm ci
npm run sync:nps-history          # Initial historical download/import; can take hours
npm run search:rebuild           # Provision FTS after initial loading
npm run search:refresh-latest
npm run benchmarks:rebuild
npm run dev -- --hostname 0.0.0.0 --port 3100
```

Open `http://localhost:3100` or `http://<LAN-IP>:3100`. Alternatively, download an
[official CSV](https://www.data.go.kr/data/15083277/fileData.do) into `data/raw/` and run
`npm run import:nps -- data/raw/<file.csv>` before provisioning indexes/benchmarks.
Pages and APIs read SQLite only; they never call the data portal.

For production, stop any server using port 3100, then:

```sh
npm run build
npm run start -- --hostname 0.0.0.0 --port 3100
```

Do not build over a running production `.next`; stop it first or use the same
`NEXT_DIST_DIR=.next-candidate` for an isolated build and test server. Rebuild after code
changes, not CSV imports. Before DB replacement, take a consistent SQLite backup and test
the candidate on a separate port; retain the previous database/build for rollback.

## Shared Design System

`@ersione/design-system` is pinned to `github:ersione/ersione-design-system#v0.5.1`. Shared React navigation, active states, form controls, chart themes and highlights are used throughout the app. Employment summaries compose DataPanel / DataBadge / DataHighlight. People=blue, salary/joiners=teal, departures=orange and movement=purple are this product's mappings.

Install a newly released tag explicitly; plain npm install keeps the locked version. Then validate, build and deploy:

```sh
# Replace v0.5.1 below with the selected newly released tag
npm install github:ersione/ersione-design-system#v0.5.1
npm run typecheck
npm test
NEXT_DIST_DIR=.next-candidate npm run build
METRICS_DISABLED=1 NEXT_DIST_DIR=.next-candidate npm run start -- --hostname 127.0.0.1 --port 3101
```

Production currently uses `.next-soft-v051`. Verify the candidate in the browser, switch the launchd NEXT_DIST_DIR and restart. Preserve the previous build, production metrics settings and data. Commit package.json and package-lock.json together. See [design system operations](docs/design-system.md) for details and validation history.

## Configuration

Next.js loads project `.env` and `.env.local` at startup; `.env.local` takes precedence.
Set `ADMIN_USER_ID` and `ADMIN_PASSWORD` in `.env`, and a random 32+ character
`COMPANY_LENS_ADMIN_SESSION_SECRET` in `.env.local` (generate with `openssl rand -hex 32`).
Restrict both files to mode `600` and restart after changes. Never use `NEXT_PUBLIC_`
for these server-only values or commit them.

`/admin` requires both credentials and uses an eight-hour signed cookie. Production login
requires `https://companylens.ersione.com/admin`; LAN HTTP is rejected. Public API v1 needs
no authentication; its OpenAPI specification is at `/api/openapi.json`.

Defaults: company DB `data/db/company-lens.sqlite`, usage DB `data/db/usage-metrics.sqlite`.
Override with `DATABASE_URL` / `METRICS_DATABASE_URL`; `METRICS_DISABLED=1` disables collection.
Backend requests, searches, company views, latency and errors are automatically aggregated
for 90 days, not counted as unique visitors. Refresh `/admin` to see updates; cache hits
that bypass the backend are excluded. Recent visits stay in the browser.

## Operations

| Task | Command |
| --- | --- |
| Discover sources without downloading/importing | `npm run sync:nps-history -- --dry-run` |
| Sync/resume; retain only the verified newest raw file | `npm run sync:nps-history -- --prune` |
| Repair statistics / benchmarks | `npm run stats:rebuild` / `npm run benchmarks:rebuild` |
| Build/resume public historical aggregates | `npm run stats:build-public` (`-- --force` rebuilds all months) |
| Rebuild search after DB replacement/direct SQL edits | `npm run search:rebuild` then `npm run search:refresh-latest` |
| Add subscriber-count index to an existing DB | `npm run search:index-employees` (no history rebuild) |
| Add two-character index to an existing database | `npm run search:rebuild-short` |
| Remove existing daily-worker workplaces/history | `npm run data:prune-daily`; add `-- --apply` to create a verified candidate for manual activation |
| Private metrics report | `npm run metrics:report -- 30` |
| Register monthly collection on macOS | `npm run sync:start-job` |
| Register production web service on macOS after building | `npm run web:start-job` |
| Restart registered web service | `launchctl kickstart -k gui/$(id -u)/com.ersione.company-lens-web` |

Imports automatically refresh statistics, benchmarks and provisioned latest-search data;
FTS is maintained by triggers. Run one data writer at a time; never interrupt an active import.
Sync resumes from `data/nps-history-manifest.json`; check `data/nps-sync-status.json` and
`data/logs/` on failure. Raw files, databases, secrets and logs stay out of Git.

macOS user LaunchAgents start at login. Collection requires system timezone Asia/Seoul:
month-end at 04:00 KST, incomplete-run retries on days 1–3 and login catch-up.
Check with `launchctl print gui/$(id -u)/com.ersione.company-lens-sync` (use
`com.ersione.company-lens-web` for the web service). Web logs: `data/logs/web.log`, `data/logs/web-error.log`.

## Checks And References

Run `npm test`, `npm run typecheck` and an isolated `npm run build`. Browser checks need
a running server, matching fixture data and Chromium: `npx playwright install chromium`,
then `npm run test:browser` (`PLAYWRIGHT_BASE_URL` overrides the target).

[Design system](docs/design-system.md) · [API contract](docs/api.md) · [Public statistics](docs/public-statistics.md) · [Metrics/auth details](docs/usage-metrics.md) · [Changelog](CHANGELOG.md)

Code: [MIT](LICENSE). Public data has separate [source usage conditions](https://www.data.go.kr/data/15083277/fileData.do); raw data is not distributed here.
