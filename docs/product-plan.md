# Product Plan

## Goal

Build a public-data company intelligence service similar in category to CreditJob and Wanted Insight, starting with National Pension Service data.

The product should answer these questions quickly:

- How many employees does this company appear to have?
- Is the company growing or shrinking?
- How many people recently joined or left?
- What is the estimated average salary?
- How does this company compare with similar companies?

## Product Principles

- Be transparent about data sources and estimates.
- Prefer trend and context over a single isolated number.
- Make company search fast and forgiving.
- Show confidence and limitations directly in the UI.
- Avoid pretending that inferred values are exact facts.

## MVP Pages

### 1. Search

Purpose:

- Let users find a company quickly.

Key UI:

- Search input
- Matching company list
- Company name
- Industry
- Address region
- Latest employee count
- Latest estimated salary

### 2. Company Detail

Purpose:

- Show the main employment and salary signals for one company.

Key sections:

- Summary header
- Estimated average salary
- Employee count
- Hires and departures
- Workforce trend chart
- Monthly history table
- Source and calculation notes

Potential metrics:

- Latest employee count
- Month-over-month employee change
- 12-month hire count
- 12-month departure count
- 12-month net growth
- Estimated annual salary
- Estimated monthly salary

### 3. Rankings / Discovery

Purpose:

- Help users discover companies by interesting signals.

Possible rankings:

- Highest estimated salary
- Fastest employee growth
- Most hires
- Highest departure ratio
- Largest companies by employee count
- Companies newly appearing in the dataset

This can come after the core search and detail pages.

## UX Notes

The app should be an actual tool on the first screen, not a landing page.

Recommended first screen layout:

- Dense search interface at the top
- Recently updated dataset status
- A few useful ranked lists below
- Clear explanation of public-data estimation in small supporting text

Visual direction:

- Serious, data-focused, readable
- Avoid a generic SaaS landing page look
- Use tables, charts, and compact stat panels
- Prioritize scanning and comparison

## Differentiation Ideas

Compared with older CreditJob-style services, Company Lens can focus on:

- More transparent calculation notes
- Stronger monthly trend visualization
- Better industry and region comparison
- Public source links
- Data freshness indicators
- Exportable snapshots later

## Open Decisions

- Korean-only or Korean-first with English code/UI labels?
- Use only downloaded file data first, or automate API ingestion early?
- Store raw files in the repo, object storage, or local data directory?
- Use PostgreSQL from the start or start with SQLite for local MVP?
- Whether to build ranking pages in MVP or after company detail is stable
