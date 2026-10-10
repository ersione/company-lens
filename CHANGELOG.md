# Changelog

## Unreleased

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
