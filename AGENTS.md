<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Data Workflow

- Do not commit generated data files under `data/`. Raw CSV files and SQLite databases are intentionally gitignored.
- The committed National Pension download recipe lives in `config/nps-source-manifest.json`.
- For a fresh checkout, run `npm install`, then `npm run sync:nps`, then `npm run dev -- -H 0.0.0.0 -p 3000`.
- If a new monthly National Pension file appears on data.go.kr, add the new month to `config/nps-source-manifest.json` first, then run `npm run sync:nps -- --from YYYY-MM --to YYYY-MM`.
- After changing import/download logic or the manifest, run `npm test` and `npm run build`.
