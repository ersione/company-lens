import Database from "better-sqlite3";
import { getDatabasePath } from "@/db/client";
import { publicOrigin } from "./social-metadata";

// Stable ID ranges avoid OFFSET scans and keep each document below 10,000 URLs.
export const sitemapRangeSize = 10000;
export const sitemapMinimumSubscribers = 50;
const eligible = `s.snapshot_month = COALESCE(
  (SELECT MAX(snapshot_month) FROM monthly_statistics),
  (SELECT MAX(snapshot_month) FROM source_files))
  AND s.employee_count >= ${sitemapMinimumSubscribers} AND LENGTH(TRIM(c.name)) > 0`;

export function readCompanySitemap<T>(read: (db: Database.Database) => T): T {
  const db = new Database(getDatabasePath(), { readonly: true });
  try { return read(db); } finally { db.close(); }
}

export function companySitemapShards(db: Database.Database): number[] {
  if (!db.prepare("SELECT 1 FROM company_latest_state WHERE id = 1").get()) return [];
  return (db.prepare(`SELECT DISTINCT CAST((s.company_id - 1) / ${sitemapRangeSize} AS INTEGER) AS shard
    FROM company_latest s JOIN companies c ON c.id = s.company_id
    WHERE ${eligible} ORDER BY shard`).all() as { shard: number }[]).map(row => row.shard);
}

export function companySitemapRows(db: Database.Database, shard: number) {
  if (!Number.isSafeInteger(shard) || shard < 0 || !Number.isSafeInteger((shard + 1) * sitemapRangeSize)) return [];
  if (!db.prepare("SELECT 1 FROM company_latest_state WHERE id = 1").get()) return [];
  return db.prepare(`SELECT s.company_id AS id, f.imported_at AS modified
    FROM company_latest s JOIN companies c ON c.id = s.company_id
    JOIN source_files f ON f.id = s.source_file_id
    WHERE s.company_id > ? AND s.company_id <= ? AND ${eligible}
    ORDER BY s.company_id`).all(shard * sitemapRangeSize, (shard + 1) * sitemapRangeSize) as { id: number; modified: string }[];
}

export function xmlEscape(value: string) {
  return value.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[char]!);
}
export const sitemapHeaders = { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=0, s-maxage=3600" };
export function companySitemapXml(rows: { id: number; modified: string }[]) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map(row =>
    `<url><loc>${publicOrigin}/companies/${row.id}</loc><lastmod>${xmlEscape(row.modified)}</lastmod></url>`).join("")}</urlset>`;
}
