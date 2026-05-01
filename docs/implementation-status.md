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
- Basic company detail page at `/companies/[id]`.
- Import-focused tests in `tests/nps-import.test.ts`.

The app intentionally does not call `data.go.kr` from user-facing pages. Raw CSV files should be downloaded manually and placed under `data/raw/`, which is ignored by git.

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

Company identity uses `사업자등록번호` when present. If it is missing, the fallback identity is normalized company name plus address.

Estimated salary uses:

```text
estimated monthly salary = 당월고지금액 / 가입자수 / 0.09
estimated annual salary = estimated monthly salary * 12
```

Rows with missing or zero employee count do not produce salary estimates.

## Verification Blocker

Dependency installation was attempted on this machine and failed after registry access succeeded.

The failing package was `esbuild`, during its native binary validation step:

```text
dyld: Symbol not found: _SecTrustCopyCertificateChain
Referenced from: node_modules/esbuild/bin/esbuild
which was built for Mac OS X 12.0
Expected in: /System/Library/Frameworks/Security.framework/Versions/A/Security
```

This points to a local macOS version compatibility issue with the downloaded `esbuild` binary, not an application-code error.

## Commands Still To Run

Run these on a compatible environment, or after confirming the `esbuild` override works on this machine:

```bash
npm install
npm test
npm run build
npm run dev
```

If `npm install` still fails on this OS, use a newer macOS environment or adjust the `esbuild` override to the newest version that still supports the local system.

## Data Caveat

All UI salary language is framed as `국민연금 기반 추정치`. The values are not exact payroll data because National Pension reporting has income caps, eligibility rules, and reporting limitations.
