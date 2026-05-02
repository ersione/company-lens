# Implementation Status

## Current MVP State

This repository now contains a working Company Lens MVP:

- Next.js App Router application with TypeScript, React 19, Next.js 16 canary, and Tailwind CSS.
- SQLite database access through `better-sqlite3`.
- Drizzle schema definitions for:
  - `source_files`
  - `companies`
  - `company_snapshots`
- Local migration helper at `db/migrate.ts`.
- National Pension Service CSV import command at `scripts/import-nps.ts`.
- National Pension Service source manifest at `config/nps-source-manifest.json`.
- National Pension Service download/sync commands at `scripts/download-nps.ts` and `scripts/sync-nps.ts`.
- Korean-first search page at `/`.
- Company detail page at `/companies/[id]`.
- Recharts-based company trend charts for subscriber count, estimated annual salary, estimated monthly salary, new joiners, and departures.
- Optimized first-page load when no search query is present.
- Public-data quality labels such as `BIZ_NO미존재사업장` are shown as user-friendly industry text.
- Root hydration warnings caused by browser extensions mutating `<html>` or `<body>` are suppressed.
- Import-focused tests in `tests/nps-import.test.ts`.

The app intentionally does not call `data.go.kr` from user-facing pages. Raw CSV files are downloaded by local scripts into `data/raw/`, which is ignored by git.

## Local Development

Run the local app with:

```bash
npm run dev -- -H 0.0.0.0 -p 3000
```

Current development URLs:

- `http://localhost:3000`
- `http://192.168.29.49:3000`

Next.js development cross-origin access is allowlisted for private LAN ranges in `next.config.mjs`:

- `10.*.*.*`
- `172.16.*.*` through `172.31.*.*`
- `192.168.*.*`

## Local Data Loaded

This machine currently has 27 National Pension workplace CSV snapshots imported into SQLite:

- `data/raw/nps-workplaces-2024-01.csv` through `data/raw/nps-workplaces-2024-12.csv`
- `data/raw/nps-workplaces-2025-01.csv` through `data/raw/nps-workplaces-2025-12.csv`
- `data/raw/nps-workplaces-2026-01.csv` through `data/raw/nps-workplaces-2026-03.csv`

Current local SQLite counts:

- Company snapshots: 15,247,686
- Source files: 27
- Snapshot range: 2024-01 through 2026-03

## Import Command

Download only:

```bash
npm run download:nps
```

Download a range only:

```bash
npm run download:nps -- --from 2026-01 --to 2026-03
```

Import a single already-downloaded file:

```bash
npm run import:nps -- data/raw/<file.csv>
```

Download all manifest entries and import anything not already loaded:

```bash
npm run sync:nps
```

The committed manifest stores public source metadata and file download URLs. The large raw CSV files and generated SQLite database remain local-only under `data/`.

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

Company identity uses `사업자등록번호`, normalized company name, and address together when registration data is present. If it is missing, the fallback identity is normalized company name plus address.

The public CSV is CP949 encoded and may use verbose status column names such as `사업장가입상태코드 1 등록 2 탈퇴`; the importer normalizes these to the canonical column names above.

Estimated salary uses:

```text
estimated monthly salary = 당월고지금액 / 가입자수 / 0.09
estimated annual salary = estimated monthly salary * 12
```

Rows with missing or zero employee count do not produce salary estimates.

## Verification

Dependency installation now succeeds on this machine with the generated `package-lock.json`.

Verified commands:

```bash
npm install
npm test
npm run build
npm audit --omit=dev
```

Browser smoke verification was also run against the local development server:

- Searching `삼성전자` returns `삼성전자(주)` as the first result.
- The detail page shows monthly trend charts and the full imported snapshot range.
- No hydration mismatch console message was observed.

## Data Caveat

All UI salary language is framed as `국민연금 기반 추정치`. The values are not exact payroll data because National Pension reporting has income caps, eligibility rules, and reporting limitations.

`가입자수`, `신규취득자수`, and `상실가입자수` should not be reconciled as a simple formula like:

```text
current subscriber count = previous subscriber count + new joiners - departures
```

The public file reports subscriber count as a monthly snapshot and new/loss counts as reported monthly events. Retroactive corrections, reporting timing, and National Pension eligibility/status rules can make the event counts differ from the net month-over-month subscriber-count change.
