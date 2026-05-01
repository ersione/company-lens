# Data Plan

## First Dataset

Use the National Pension Service workplace data from data.go.kr:

- Dataset page: `https://www.data.go.kr/data/15083277/fileData.do`
- Known title pattern: National Pension Service workplace subscription details
- Update cadence appears to be monthly

Expected useful fields:

- Workplace name
- Address
- Industry
- Subscriber count
- Current month billed amount
- New subscribers
- Lost subscribers

Exact column names should be confirmed after downloading the current file.

## MVP Data Model

Suggested logical tables:

### companies

- `id`
- `name`
- `normalized_name`
- `industry`
- `address`
- `region`
- `created_at`
- `updated_at`

### company_monthly_snapshots

- `id`
- `company_id`
- `snapshot_month`
- `employee_count`
- `monthly_billed_amount`
- `new_joiners`
- `departures`
- `estimated_average_monthly_salary`
- `estimated_average_annual_salary`
- `source_file_id`
- `created_at`

### source_files

- `id`
- `source_name`
- `source_url`
- `file_name`
- `snapshot_month`
- `downloaded_at`
- `checksum`

## Salary Estimation

The National Pension workplace file typically includes subscriber count and monthly billed amount.

Approximate formula:

```text
estimated_average_monthly_salary = monthly_billed_amount / employee_count / pension_rate
estimated_average_annual_salary = estimated_average_monthly_salary * 12
```

The exact pension rate must be confirmed for the target year and whether the billed amount represents employee share, employer share, or total contribution.

Important constraints:

- National Pension has lower and upper income bounds.
- High earners can be capped, lowering the apparent average.
- Some workers may not be represented.
- Small companies can be noisy.
- Month-level joins/departures may not equal HR-defined hires/departures.

## Derived Metrics

Useful metrics for the app:

- Latest employee count
- Employee count month-over-month change
- Employee count 12-month change
- New joiners in latest month
- Departures in latest month
- 12-month joiner total
- 12-month departure total
- 12-month net employee growth
- Departure ratio: departures over average employee count
- Estimated annual salary
- Salary percentile within industry

## Import Pipeline

Initial pipeline steps:

1. Download source file manually from data.go.kr.
2. Place it in a local ignored data directory.
3. Parse the file into a staging table.
4. Normalize company names and addresses.
5. Upsert companies.
6. Insert monthly snapshots.
7. Compute derived metrics for search and ranking.

Later automation:

- Track file updates from data.go.kr.
- Download files through an API key if available.
- Keep raw file checksums to prevent duplicate imports.
- Add import validation reports.

## Validation Checks

Before trusting an import:

- Row count is within expected range.
- Required columns exist.
- Employee count is numeric and non-negative.
- Billed amount is numeric and non-negative.
- Snapshot month is detected correctly.
- Duplicate company rows are understood and handled.
- Salary estimates outside plausible bounds are flagged.

## Privacy And Wording

Do not imply access to private payroll or individual worker data.

Recommended wording:

- "Public data based estimate"
- "Estimated from National Pension workplace data"
- "May differ from actual payroll"

Avoid:

- "Actual salary"
- "Exact employee count"
- "Confirmed departures"
