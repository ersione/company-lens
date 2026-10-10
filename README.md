# Company Lens

Company Lens is a company intelligence product built from public employment and corporate datasets.

The first version focuses on Korean public data, especially National Pension Service workplace data, to show company-level signals such as estimated average salary, employee count, hires, departures, and workforce trend.

## API

Read-only, unauthenticated API v1 is documented in [docs/api.md](docs/api.md).
The running service provides `/api-docs` and the machine-readable `/api/openapi.json`.
It exposes company search, latest detail/comparisons, bounded monthly history, and dataset status.
No bot, DNS, or public ingress configuration is changed by the API implementation.

## Product Direction

Company Lens should feel closer to a practical company research tool than a marketing site. The first screen should help users search for a company and quickly judge employment scale, pay signal, and workforce momentum.

Initial target users:

- Job seekers checking whether a company is growing or shrinking
- Employees comparing compensation and workforce movement
- Researchers looking at company-level labor market signals
- Founders/operators benchmarking companies in the same industry

## MVP Scope

Core features:

- Company search by name
- Company profile page
- Estimated average annual salary
- Current employee count
- Monthly hires and departures
- Employee count trend over time
- Industry and address metadata
- Clear source and calculation disclosure

Out of scope for the first cut:

- User reviews
- Login and saved companies
- Paid plans
- Company self-editing
- Job postings
- Full financial statement analysis

## Data Sources

Primary MVP source:

- National Pension Service workplace subscription data from data.go.kr

Likely later sources:

- Employment insurance and industrial accident insurance public data
- DART filings for listed companies
- ALIO for public institutions
- Cleaneye for local public enterprises

## Important Caveat

Salary values must be presented as estimates derived from public insurance-related data, not exact payroll data.

The UI should use wording such as:

- "Estimated average salary"
- "National Pension based estimate"
- "Public data estimate"

Avoid wording that implies exact compensation:

- "Actual salary"
- "Confirmed salary"
- "Payroll average"

## Technology

Next.js App Router, TypeScript, npm, SQLite/better-sqlite3, Drizzle, and Chart.js.
The production build uses webpack (`npm run build`) on this host.

## Current Implementation

The Next.js/SQLite MVP supports local CSV import, Korean company search, and company details. See `docs/implementation-status.md` for dataset provenance, salary calculation rules, and verification results.

Company details include monthly subscriber, acquisition/loss, and estimated salary charts with 1-year, 3-year, and full-history ranges. Missing months remain gaps. Homepage statistics are read from a precomputed `monthly_statistics` table, not aggregated on page requests.

## Historical Data

Company substring search uses a local SQLite FTS5 trigram index. Run `npm run search:rebuild` once after the initial import or to repair the index. Subsequent company inserts, name changes, and deletes update it transactionally through database triggers. Public web/API searches require at least three characters and use FTS. Only the internal legacy query helper retains shorter prefix/substring fallback behavior. Index creation runs only from this command, never during a page request. Once provisioned, latest-company metrics come from `company_latest`, not per-candidate history lookups; see Latest-company search data below.

```bash
npm run sync:nps-history
npm run stats:rebuild
```

The sync command discovers the official historical CSV list and latest file, downloads gzip-compressed local copies, and imports oldest-first. Legacy Korean/English/type-suffixed headers and EUC-KR are supported. Each file imports atomically and regenerates only its month's statistics. Duplicate checksums are computed over decompressed bytes. Same-month revisions use the newest publication date; older imports never overwrite newer company metadata. Manual imports infer publication dates from a `YYYYMMDD` filename; otherwise supply `--published-at=YYYY-MM-DD`, especially for same-month revisions.

Progress, source identifiers, URLs, checksums, and failures are stored in `data/nps-history-manifest.json`. Rerunning resumes completed work and retries failed files. Files can have publication dates different from their internal snapshot month. The import stops before a new file when disk space falls below 3GB.

For an initial backfill, `npm run history:start-job` starts a one-shot launchd import job so terminal closure does not interrupt loading. For ongoing collection on this Mac, use `npm run sync:start-job`, which replaces that one-shot registration with the month-end schedule described below. Logs are under `data/logs/`; only run one importer at a time.

```bash
launchctl print gui/$(id -u)/com.ersione.company-lens-history
tail -n 30 data/logs/nps-history.log
```

The official list currently reaches a file published under December 2015 whose actual snapshot month is November 2015. Full historical backfill can take hours. Company name/address changes can split histories because registration numbers are only partially exposed; ambiguous identities are not merged automatically. Historical industry statistics use each snapshot's reported industry, not today's company industry.

Requires Node.js 22 or later.

## Search Filters And Pagination

Web search supports region, minimum National Pension subscribers, relevance/subscriber sorting, and previous/next pages (20 results per page). Filter changes reset the page; URLs retain the selected conditions for reloads and browser history. Region uses the company's representative address, including historical Gangwon/Jeonbuk province names.

The API supports the same `region`, `minEmployees`, `sort`, and `page` parameters. Existing `q`/`limit` calls still work. Filters apply to canonical latest company snapshots before pagination; ties end with company ID for stable ordering. Search fetches one extra row to report `hasMore`, not a full-result count. Pages are capped at 1000; refine broad searches rather than requesting deeper offsets. Results can change after a data refresh.

The previous `sync:nps`, `download:nps`, `rebuild:search-index`, Recharts component, and stored-salary schema have been superseded. Use the current commands above; no legacy index or importer runs alongside them.

## License And Attribution

Application code is licensed under the [MIT License](LICENSE). National Pension public data is separate from the application license; refer to the [official dataset](https://www.data.go.kr/data/15083277/fileData.do) for its usage conditions and attribution. Raw source files and SQLite are not distributed in Git.

## Company Benchmarks

`npm run benchmarks:rebuild` precomputes comparisons for the newest canonical month only.
Imports refresh this cache when the latest month's statistics change; page requests only
look up a company ID. No historical snapshots are removed or re-sorted on page requests.

Comparisons count active disclosed workplaces with positive subscriber counts. Salary
comparisons additionally require a positive estimate. National and industry top percentages
use cumulative descending ranks (equal values share a rank, including all tied workplaces).
Industry comparisons exclude unknown/mixed industries and require at least 30 valid values
for the respective metric. Display percentages round upward, to 0.1 points below 1% and
whole points otherwise. These are not rankings of all Korean legal companies or actual payroll.

## Compact Database

Schema version 2 keeps every historical observation and company ID. Snapshot rows no longer
store import timestamps or calculated salaries: timestamps come from `source_files`, and
salary estimates are calculated at query time with the snapshot year's contribution rate.
The source lookup index also enforces snapshot uniqueness; a redundant company/month index
is removed. The full-text search index and precomputed monthly statistics are retained.

The local replacement on October 10, 2026 reduced SQLite from 19.82 GB to 13.93 GB while
preserving 67,189,458 observations across 130 months. Following production verification,
the legacy database and 131 imported originals were deleted; only `nps-20260923.csv` remains.
Source metadata and the download manifest are retained. The local verification and cleanup
report is `data/db/compaction-report.json` (ignored by git along with the data).

To migrate a legacy database, create a separate candidate (never overwrite the original):

```bash
npm run db:compact -- data/db/company-lens.sqlite data/db/company-lens.sqlite.compact
```

This command compares every retained row and calculated salary, checks database/foreign-key
integrity, rebuilds search, and writes `<destination>.verified.json` only on success. It does
not activate or delete databases. Test the candidate using `DATABASE_URL` and a separate
server port before stopping the production service and swapping files. Keep the original
until the replacement passes production checks. Legacy schemas are explicitly rejected by
the new app instead of being rewritten during a page request.

Verification uses a temporary 2 GiB SQLite read cache plus a 1 GiB memory-map window to
avoid repeated random disk reads. A completed candidate whose verification was interrupted
can be fully rechecked without copying or rebuilding its data:

```bash
npm run db:verify -- data/db/company-lens.sqlite data/db/company-lens.sqlite.compact
```

Set `NEXT_DIST_DIR=.next-candidate` when building and starting a candidate server to avoid
overwriting the running production build. Keep this variable consistent for both commands.

Imported raw archives may be deleted after validation; the app needs only SQLite. Keep the
latest original CSV, `source_files`, and `data/nps-history-manifest.json` for provenance and
future downloads. The sync command recognizes previously imported checksums even after
their local raw files have been removed.

### Latest-company search data

Run `npm run search:refresh-latest` once after importing history or replacing/compacting the
database. This atomically builds `company_latest`, a small projection containing each
company's latest canonical snapshot metrics. Until it finishes, searches retain the indexed
history lookup. Once ready, nonempty searches join this table by company primary key rather
than looking up historical snapshots for every FTS candidate. Detail/history queries remain
unchanged; no extra indexes are added to the large snapshot table.

Subsequent CSV imports and statistics rebuilds refresh affected companies in the same
transaction, including companies omitted by a replacement source. Direct SQL edits to
snapshots or canonical source selections require running this command again. Do not manually
empty the table without also clearing `company_latest_state`. The command is not a recurring
collector; the monthly collector below refreshes this projection automatically after imports.

### Monthly Collection On macOS

The [official dataset](https://www.data.go.kr/data/15083277/fileData.do) declares monthly
updates and, as checked on 2026-10-11, lists the next publication as 2026-10-26. Its notes
describe generation after the qualification deadline on the 15th, with business-day
adjustments; this is not a fixed portal publication date. Collect at month-end to allow
publication delays rather than assuming the generation date is the download date.

```bash
npm run sync:nps-history -- --dry-run
npm run sync:start-job
launchctl print gui/$(id -u)/com.ersione.company-lens-sync
```

Registration replaces the old one-shot history LaunchAgent, not the web service. The primary
run is the last calendar day at 04:00 KST, including leap years. launchd wakes the script on
days 28-31; the script checks which publication month is due and skips completed months
before any network access. Days 1-3 at 04:00 retry incomplete runs only. `RunAtLoad` catches
missed months at the next login; this is a user LaunchAgent, not a pre-login system daemon.
The registration command requires the Mac system timezone to be Asia/Seoul. Repeating it
with identical settings does not restart the job.

The collector discovers official sources, skips imported checksums even if originals were
pruned, downloads/imports missing sources, and refreshes statistics, benchmarks and latest
search metrics. A shared SQLite advisory lock prevents concurrent sync/manual import CLIs;
an exited owner's lock can be recovered safely. Use only one writer for other maintenance.
After complete success, checksum-verified cleanup retains exactly one latest original CSV
(possibly gzip-compressed). Import, download or verification failures preserve raw sources.
A missing current-month publication does not mark the scheduled month complete.

Local status is `data/nps-sync-status.json`; logs are `data/logs/nps-sync.log` and
`data/logs/nps-sync-error.log`. A clean run with no new sources is normal. Failures return a
nonzero exit code and remain in status/manifest; no external notifications are configured.
After investigating an error, retry the scheduled run with:

```bash
launchctl kickstart gui/$(id -u)/com.ersione.company-lens-sync
# Force a source check independently of the monthly completion marker:
npm run sync:nps-history -- --prune
```

Do not use `kickstart -k` to interrupt an active import. A dry run performs discovery and
comparison only: no downloads, imports, manifest/status changes or raw cleanup. It briefly
acquires the local writer lock. API/web requests never contact the data portal.

After replacement has passed production checks, verify all originals before pruning:

```bash
npm run data:prune -- --keep=data/raw/nps-20260923.csv
# The same verification followed by deletion:
npm run data:prune -- --keep=data/raw/nps-20260923.csv --apply
```

Pruning hashes decompressed CSV bytes, refuses unimported/changed files, and requires the
retained CSV to match the newest imported source. The default is a dry run.

```bash
npm ci
npm run import:nps -- data/raw/<file.csv>
npm test
npm run typecheck
npm run dev
```

Download the CSV from the [official National Pension dataset](https://www.data.go.kr/data/15083277/fileData.do) into `data/raw/`. UTF-8 and EUC-KR are supported. Raw files and the database stay local and are not included in git.

For LAN access, run `npm run dev -- --hostname 0.0.0.0 --port 3100` and open `http://<your-LAN-IP>:3100`.

For regular use without development compilation overhead, run `npm run build`, then `npm run start -- --hostname 0.0.0.0 --port 3100` instead. Stop the development server first if it is using that port. Rebuild after changing application code; CSV imports do not require rebuilding.

Production builds use Webpack to keep resource usage manageable on this Mac. The Next.js version and production server are unchanged.

On this Mac, run `npm run web:start-job` after building to keep the production server running independently of the terminal. Stop any existing server on port 3100 first. The launchd service starts at login and restarts on exit; logs are in `data/logs/web.log` and `data/logs/web-error.log`.

```bash
launchctl print gui/$(id -u)/com.ersione.company-lens-web
# After rebuilding, restart the registered web service:
launchctl kickstart -k gui/$(id -u)/com.ersione.company-lens-web
```

Browser tests use Playwright and require the September 2026 dataset and a running server. Install Chromium with `npx playwright install chromium`, then run `npm run test:browser`. To use an installed Chrome instead, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to its executable. Set `PLAYWRIGHT_BASE_URL` to test a different URL. See `docs/implementation-status.md` for the local LAN example.
