# Changelog

- Add three-year employment summaries, complete twelve-month acquisition/loss totals and rule-based trend summaries.
- Cache same-industry subscriber-size cohort salary/growth medians during import and benchmark rebuild (OpenAPI 1.3.0).

## Unreleased

- Adopt the Git-pinned Ersione design-system package for shared React controls, semantic data colors, unified metrics, source tables and brand styling. Keep domain data and search behavior in Company Lens.

- Add resumable month/industry/region/subscriber-size employment cubes, precomputed monthly/annual rollups and automatic canonical-source refresh. Publish employment trends and industry/region pages with Chart.js history, honest partial-year coverage and aggregation caveats. Sitemap includes statistics, not company detail pages.
- Add industry growth/decline rankings using exact 1/3/12-month comparisons from monthly rollups; default to yearly headcount growth, with minimum-size safeguards for percentage rankings.

- Default search to workplaces in the latest loaded month, with an explicit historical-workplace checkbox/API option and last-observed labels. Preserve historical detail/history and existing visibility/safety guards (OpenAPI 1.7.0). One-character searches remain unsupported.
- Default web/API search ordering to latest subscriber count; retain optional relevance ordering with legal-form/whitespace-aware name ranking. Add an explicitly provisioned subscriber-count index to latest-company metrics (OpenAPI 1.6.0). One-character searches remain unsupported.
- Exclude explicitly marked daily-worker workplaces on import; add isolated, verified removal of existing workplaces and their complete histories, refreshed statistics/benchmarks and compacted storage. Preserve ordinary names containing 일용 and original source provenance (OpenAPI 1.5.2).
- Allow two-character company/number searches across web, comparison and API validation (OpenAPI 1.5.1); add a dedicated bigram FTS auxiliary index with import-maintained triggers, exact substring verification and the existing broad-candidate guard.

- Replace fixed example companies with private browser-local recent workplace visits, limited to five / 30 days, with individual/all deletion and safe storage failure handling; the local history is not transmitted.
- Add backend-only daily web/API usage, search trends/outcomes, workplace popularity and subscriber-size trends, latency buckets and HTTP error metrics in a separate 90-day SQLite store, with bounded cardinality, deferred fail-open recording and a private `metrics:report` command.
- Add `/admin` charts and channel/period filters, protected by matching the configured ID and password with stateless eight-hour signed cookies, same-origin POST checks and process-local attempt limiting. No account/auth database; credentials remain server-local.
- Switch searched pages to a compact results-first layout, emphasizing the query and exact total while retaining the overview on the initial screen.
- Add exact filtered result/page totals and numbered search navigation with first/last shortcuts; count before page retrieval in one read transaction (OpenAPI 1.5.0).
- Hide single-canonical-month zero-subscriber workplaces from search and similar-name suggestions regardless of age, preserving detail/history and ignoring superseded revisions.
- Exclude explicitly marked daily-worker workplaces with a latest count of zero from discovery regardless of age; retain positive/unknown daily-worker counts and direct histories.
- Reject overly broad searches before synchronous SQLite latest-row lookups and sorting, with actionable web/comparison/API errors and safe optional suggestions.
- Hide stale zero-subscriber records from web/API search and similar-name suggestions while retaining direct details and histories.
- Show unverified earlier/later workplace record links using matching public identity hints, similar names and adjacent canonical observations, without stitching histories (OpenAPI 1.4.0).
- Add shareable three-workplace comparisons and read-only comparison/insights API (OpenAPI 1.2.0).
- Summarize exact year-over-year changes and contiguous subscriber trends without bridging missing months.
- Precompute industry headcount/estimated-salary medians with independent 30-sample thresholds.
- Preserve collected names on future imports, and label similar-name workplaces as unverified search candidates.
- Align home heading, social metadata and preview image with "숫자로 보는 회사".

- Integrate the current production application on top of the existing main history.
- Add region and minimum-subscriber filters, relevance/subscriber sorting, and bounded search pagination to the web and API.
- Preserve search conditions in URLs; reset pagination when submitting new conditions.
- Keep the compact schema v2 database, trigger-maintained FTS5 index, historical imports, monthly statistics, and company benchmarks.
- Materialize latest-company search metrics and refresh them atomically after imports, avoiding per-candidate history lookups.
- Add month-end launchd collection, incomplete-run retries, login catch-up, dry runs, import locking, status logs, and checksum-verified latest-only raw retention.
- Keep Chart.js history charts, Korean typography, read-only API, OpenAPI contract, and Open Graph previews.
- Retain the MIT license, source attribution, and favicon from the previous main implementation.
- Replace the old manifest-based downloader, stored-salary schema, duplicate search index, and Recharts implementation with the current equivalents.

## Previous Main Implementation

The five commits before this integration introduced manifest-based 2024-01 through 2026-03 imports, Recharts history charts, search filters/pagination, FTS5 name search, and the MIT license. Their Git history is retained. The old sync/index commands and schema are superseded by the current README and are not supported entry points.
