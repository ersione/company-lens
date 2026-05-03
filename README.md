# Company Lens

Company Lens is a local-first company search tool built from Korean public data. It currently uses National Pension Service workplace data from the public data portal to show company-level signals such as subscriber count, new joiners, departures, and estimated average salary.

The app does not ship with the generated SQLite database or raw CSV files. Those files are recreated locally from the committed source manifest.

## Stack

- Next.js App Router
- React 19
- TypeScript
- SQLite through `better-sqlite3`
- Recharts

## Current Features

- Company-name search against local National Pension workplace data
- SQLite FTS5 trigram index for fast Korean substring company-name search
- Search pending state for button clicks and Enter-key submissions
- Region, subscriber-count, and sort filters
- 10-result pages with pagination
- Large-result refinement prompt before loading long result lists
- Company detail trend charts for subscribers, estimated salary, new joiners, and departures

## Fresh Checkout Setup

Install dependencies:

```bash
npm install
```

Download all National Pension source files listed in the manifest and import them into SQLite:

```bash
npm run sync:nps
```

Use `download:nps` only when you want to download raw CSV files without importing them:

```bash
npm run download:nps
```

Run the development server:

```bash
npm run dev -- -H 0.0.0.0 -p 3000
```

Open:

- `http://localhost:3000`
- `http://<your-lan-ip>:3000`

The generated files are local-only and ignored by git:

- `data/raw/*.csv`
- `data/db/company-lens.sqlite`
- SQLite WAL/SHM sidecar files

## License And Data Source

The application source code is released under the MIT License. See `LICENSE`.

The National Pension workplace data is sourced from the Korean public data portal:

```text
https://www.data.go.kr/data/15083277/fileData.do
```

The generated SQLite database and downloaded CSV files are not included in this repository. Recreated data files should be used according to the original public-data source terms and attribution requirements from data.go.kr and the National Pension Service.

## Data Manifest

The committed source manifest is:

```text
config/nps-source-manifest.json
```

It stores the public download recipe for each monthly snapshot:

- `snapshotMonth`: data month used by the app, for example `2026-03`
- `fileName`: local CSV file name under `data/raw/`
- `sourcePageUrl`: public data portal dataset page
- `downloadUrl`: actual file download URL
- `publishedDate`: portal registration date
- `publicDataDetailPk`, `publicDataHistSn`, `atchFileId`, `fileDetailSn`: portal identifiers kept for traceability

Current manifest range:

```text
2024-01 through 2026-03
```

## Download And Import Commands

Download every manifest entry:

```bash
npm run download:nps
```

Download only a range:

```bash
npm run download:nps -- --from 2026-01 --to 2026-03
```

Import one already-downloaded file:

```bash
npm run import:nps -- data/raw/nps-workplaces-2026-03.csv
```

Download and import all manifest entries, skipping files already downloaded and files already imported:

```bash
npm run sync:nps
```

Sync only a range:

```bash
npm run sync:nps -- --from 2026-03 --to 2026-03
```

Rebuild the company-name search index for an existing SQLite database:

```bash
npm run rebuild:search-index
```

Fresh imports update the search index automatically. Use `rebuild:search-index` when opening an older local database created before the FTS search index existed.

## Adding A New Month

When a new public data file appears, for example the 2026-04 snapshot:

1. Open the source page:

```text
https://www.data.go.kr/data/15083277/fileData.do
```

2. Find the new history row for the latest `국민연금공단_국민연금 가입 사업장 내역_YYYYMMDD` entry.

3. Open its detail layer or inspect the page response and collect:

```text
publicDataDetailPk
publicDataHistSn
atchFileId
fileDetailSn
publishedDate
```

4. Add a new object to `config/nps-source-manifest.json`.

Example shape:

```json
{
  "snapshotMonth": "2026-04",
  "publicDataDetailPk": "uddi:...",
  "publicDataHistSn": "1",
  "publishedDate": "2026-05-23",
  "atchFileId": "FILE_...",
  "fileDetailSn": "1",
  "fileName": "nps-workplaces-2026-04.csv",
  "sourcePageUrl": "https://www.data.go.kr/data/15083277/fileData.do",
  "downloadUrl": "https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=FILE_...&fileDetailSn=1&insertDataPrcus=N"
}
```

5. Download and import only that month:

```bash
npm run sync:nps -- --from 2026-04 --to 2026-04
```

6. Verify:

```bash
npm test
npm run build
```

The `snapshotMonth` is the data month, not always the portal registration month. In practice, a file published in May often represents April data.

## Verification

Run:

```bash
npm test
npm run build
```

## Data Caveat

Salary values are estimates derived from National Pension public data. They are not exact payroll data.

The estimate currently uses:

```text
estimated monthly salary = monthly billed amount / subscriber count / 0.09
estimated annual salary = estimated monthly salary * 12
```

Subscriber count, new joiners, and departures should not be reconciled as a simple formula. The public file reports subscriber count as a monthly snapshot and new/loss counts as monthly events, and timing or retroactive corrections can make them differ from net month-over-month movement.
