# Changelog

## Unreleased

### Added

- Added a manifest-based National Pension source workflow with `config/nps-source-manifest.json`.
- Added committed download metadata for National Pension workplace snapshots from `2024-01` through `2026-03`.
- Added `download:nps` and `sync:nps` commands for recreating local raw CSV files and the SQLite database after checkout.
- Added company detail trend charts for subscriber count, estimated annual salary, estimated monthly salary, new joiners, and departures.
- Added Recharts for chart rendering.
- Added a favicon and agent guidance files.
- Added region, subscriber-count, and sort filters to company search.
- Added pagination with 10 results per page.
- Added a large-result refinement prompt that asks users to narrow broad searches before loading result rows.
- Added a search pending state for button clicks and Enter-key submissions.
- Added a latest-snapshot employee-count index for filtered search.

### Changed

- Simplified company search to company-name search only.
- Optimized first-page access by avoiding initial recent-company queries.
- Improved company detail layout and chart styling.
- Improved broad-search behavior by doing a count-only lookup before loading results that will be hidden behind the refinement prompt.
- Improved National Pension CSV import handling for CP949 files, verbose public-data column names, and duplicate source files.
- Updated README with fresh checkout, data sync, local startup, and new monthly data instructions.
- Updated implementation status documentation with the current loaded data range and verification commands.
- Suppressed root hydration warnings caused by browser extensions mutating document attributes.
- Allowlisted private LAN origins for the Next.js development server.

### Fixed

- Removed the 24-month company history limit so all imported snapshots appear in detail charts.
- Improved handling of public-data quality industry labels such as `BIZ_NO미존재사업장`.

### Verified

- `npm run download:nps -- --from 2026-03 --to 2026-03`
- `npm run sync:nps -- --from 2026-03 --to 2026-03`
- `npm test`
- `npm run build`
