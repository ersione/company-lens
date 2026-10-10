<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Data Workflow

- Never commit `data/`, raw CSV files, SQLite databases, logs, or environment secrets.
- The supported sync command is `npm run sync:nps-history`; it discovers official sources and resumes using local `data/nps-history-manifest.json`.
- Monthly collection is registered with `npm run sync:start-job`: last day 04:00 KST, incomplete-run retries on days 1-3, and login catch-up. `--dry-run` verifies discovery without downloading/importing; `--prune` retains the checksum-verified newest raw source only after complete success. Respect the shared import lock and check `data/nps-sync-status.json` plus sync logs on failure.
- Use `npm run import:nps -- <file>` for a downloaded monthly source. Imports refresh monthly statistics and latest-month benchmarks.
- Provision the FTS index with `npm run search:rebuild` after initial loading. Do not rebuild indexes from a page request.
- Provision latest-company metrics with `npm run search:refresh-latest` after loading or replacing the database. Imports/statistics refresh affected rows atomically once provisioned. Rebuild after direct SQL snapshot/canonical-source edits; never from a page request.
- Schema version 2 calculates salaries at query time. Do not restore legacy stored salary columns or the old `company_search_fts` table.
- Run `npm test`, `npm run typecheck`, `npm run build`, and relevant browser tests after importer or query changes.
