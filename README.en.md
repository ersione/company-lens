# Company Lens

Explore Korean workplaces through National Pension Service public data: subscriber counts, estimated salaries and employment changes.

![Node.js 22 or later](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
[![MIT License](https://img.shields.io/badge/License-MIT-blue)](LICENSE)

**[Open the service](https://companylens.ersione.com)** · [API documentation](https://companylens.ersione.com/api-docs) · **[한국어](README.md)** · English

[Features](#features) · [Installation](#installation) · [Usage](#usage) · [Development](#development-and-configuration)

## Features

- **Workplace search:** Search by name or publicly available business registration number; filter by region and minimum subscriber count, and choose a sort order.
- **Workplace details:** Explore monthly subscriber counts, estimated salaries, acquisitions/losses and industry/size benchmarks.
- **Workplace comparison:** Compare key figures and employment history for up to three workplaces.
- **Employment statistics:** View monthly trends, industry/regional histories, annual summaries and 1-, 3- or 12-month change rankings.
- **Recent visits:** Return to recently viewed workplaces stored in your browser.
- **Read-only API:** Query workplace search, details, history, employment insights, comparisons and dataset status without authentication.

## Data source and interpretation

Data comes from the [National Pension Service workplace dataset on Korea's public data portal](https://www.data.go.kr/data/15083277/fileData.do).
Pages and APIs read imported SQLite data; they do not contact the data portal on each request.

Salaries are **National Pension-based estimates**, not actual payroll. Subscriber counts do not establish actual staff totals or legal company size.
Acquisition/loss counts may differ from actual hires/departures and unique people. Matching workplace names do not establish a shared corporate identity.
Explicit daily-worker workplaces are excluded during import.

Search defaults to the latest loaded month. Absence from the latest data does not imply closure.
Enable the historical-workplace option to search older records. See the [public statistics documentation](docs/public-statistics.md) for calculation rules.

## Requirements

- Node.js 22 or later and npm
- Internet access to download source data
- Disk space for raw CSVs, SQLite and search indexes. The search-index command requires at least 5GB of free space.
- Native build tools for `better-sqlite3` if a prebuilt binary is unavailable for your environment

## Installation

To run your own instance, clone the repository, install dependencies and prepare the data. Initial historical collection/import can take hours.

```sh
git clone https://github.com/ersione/company-lens.git
cd company-lens
npm ci
npm run sync:nps-history
npm run search:rebuild
npm run search:refresh-latest
npm run benchmarks:rebuild
npm run stats:build-public
npm run dev -- --port 3100
```

Open <http://localhost:3100>. Raw data, databases and logs are excluded from Git.

If you downloaded an official CSV yourself, replace `sync:nps-history` with the following command, then continue with the index and statistics commands above:

```sh
npm run import:nps -- data/raw/<file.csv>
```

For later updates, run `npm run sync:nps-history` again. Collection resumes from local progress records.
Completed imports refresh the affected month's statistics, benchmarks and already-provisioned latest-company search data. Run data-writing commands one at a time.

## Usage

1. Open the [service](https://companylens.ersione.com) or your local instance and enter a workplace name/public number using 2–100 characters.
2. Optionally select region, subscriber-count, sort and historical-record filters, then press **Search** or Enter.
3. Open a workplace to inspect its history and benchmarks. Choose up to three workplaces in the comparison view.
4. Use the navigation to explore employment trends, employment changes, industries and regions.

Use server-to-server GET requests for the API. Preserve the dataset month and estimate caveats when presenting its results.

```sh
curl -G 'https://companylens.ersione.com/api/v1/companies' \
  --data-urlencode 'q=삼성전자' --data 'limit=5'
```

See [API documentation](https://companylens.ersione.com/api-docs) for parameters, responses and errors, or the machine-readable [OpenAPI JSON](https://companylens.ersione.com/api/openapi.json).
Cross-origin browser CORS access is not enabled.

## Development and configuration

Built with Next.js, React, TypeScript, SQLite/Drizzle, Chart.js and the [Ersione Design System](https://github.com/ersione/ersione-design-system).
Environment variables can be set in `.env.local`; never commit secrets.

| Variable | Purpose | Default |
| --- | --- | --- |
| `DATABASE_URL` | Workplace SQLite file path (optional `file:` prefix) | `data/db/company-lens.sqlite` |
| `METRICS_DATABASE_URL` | Usage-aggregate SQLite file path | `data/db/usage-metrics.sqlite` |
| `METRICS_DISABLED` | Set to `1` to disable backend usage collection | Collection enabled |
| `NEXT_DIST_DIR` | Next.js build output directory | `.next` |
| `PLAYWRIGHT_BASE_URL` | Browser test target | `http://127.0.0.1:3100` |

```sh
npm test
npm run typecheck
npm run build
```

Browser tests require Chromium and a running server with the data expected by the tests.
Install the browser with `npx playwright install chromium`, then run `npm run test:browser`.

For self-hosting, prepare the data, run `npm run build`, then `npm run start -- --port 3100`.
Use a separate `NEXT_DIST_DIR` for candidate builds to avoid overwriting the output of a running server.

Public pages provide server-rendered content, page-specific canonical/social metadata and sitemaps.
Workplaces with at least 50 subscribers in the latest loaded month are included in split sitemaps; internal searches, comparisons and admin pages are noindex.
Sitemap inclusion does not establish actual search-engine indexing.

## License

Code is available under the [MIT License](LICENSE). Public data has separate [source usage conditions](https://www.data.go.kr/data/15083277/fileData.do); raw data is not distributed in this repository.
