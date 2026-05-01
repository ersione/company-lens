# Company Lens

Company Lens is a company intelligence product built from public employment and corporate datasets.

The first version focuses on Korean public data, especially National Pension Service workplace data, to show company-level signals such as estimated average salary, employee count, hires, departures, and workforce trend.

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

## Suggested Tech Direction

The stack has not been finalized. A pragmatic default would be:

- Next.js for the web app
- PostgreSQL for normalized company and monthly employment data
- Prisma or Drizzle for database access
- A batch import pipeline for downloaded public data files
- Server-side search first, then a dedicated search engine later if needed

## Next Session

Start by reading:

- `docs/product-plan.md`
- `docs/data-plan.md`

Then decide the initial stack and scaffold the app.

## Current Implementation

The initial Next.js/SQLite MVP scaffold has been added. See `docs/implementation-status.md` for the implemented scope, local import command, and the current dependency-install blocker on older macOS systems.
