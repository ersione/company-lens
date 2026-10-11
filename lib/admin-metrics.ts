import Database from "better-sqlite3";
import fs from "node:fs";
import { getDatabasePath } from "@/db/client";
import { latencyBounds, metricDay, metricsPath } from "./usage-metrics";

export const sizeLabels: Record<string, string> = { "0": "0명", "1-9": "1~9명", "10-49": "10~49명", "50-299": "50~299명", "300-999": "300~999명", "1000+": "1,000명 이상", unknown: "인원 미상" };
export type AdminFilters = { days: 7 | 30 | 90; channel: "all" | "web" | "api" };
export function adminFilters(params: Record<string, string | string[] | undefined>): AdminFilters {
  return { days: params.days === "7" ? 7 : params.days === "90" ? 90 : 30,
    channel: params.channel === "web" ? "web" : params.channel === "api" ? "api" : "all" };
}
type RequestRow = { day: string; channel: string; operation: string; status: number; bucket: number; requests: number; totalMs: number; maxMs: number };
type SearchRow = { day: string; term: string; outcome: string; requests: number };
type SizeRow = { day: string; band: string; views: number };
export type AdminMetrics = {
  dates: string[]; filters: AdminFilters; error: boolean;
  totals: { requests: number; web: number; api: number; searches: number; empty: number; details: number; errors4xx: number; errors5xx: number; averageMs: number | null; p95Ms: number | null };
  traffic: { web: number[]; api: number[] };
  terms: { term: string; total: number; empty: number; values: number[] }[];
  companies: { id: number; name: string; views: number; sizeBand: string; snapshotMonth: string }[];
  sizes: { band: string; label: string; total: number; values: number[] }[];
  latency: { average: (number | null)[]; p95: (number | null)[] };
  errors: { client: number[]; server: number[] };
};
function requests(rows: RequestRow[]) { return rows.reduce((sum, row) => sum + row.requests, 0); }
function p95(rows: RequestRow[]) {
  const count = requests(rows);
  if (!count) return null;
  let cumulative = 0;
  for (const bound of latencyBounds) {
    cumulative += requests(rows.filter((row) => row.bucket === bound));
    if (cumulative >= Math.ceil(count * 0.95)) return bound;
  }
  return null;
}
function average(rows: RequestRow[]) { const n = requests(rows); return n ? rows.reduce((sum, row) => sum + row.totalMs, 0) / n : null; }

export function getAdminMetrics(filters: AdminFilters, now = Date.now()): AdminMetrics {
  const dates = Array.from({ length: filters.days }, (_, i) => metricDay(now - (filters.days - i - 1) * 86400000));
  const result: AdminMetrics = { dates, filters, error: false,
    totals: { requests: 0, web: 0, api: 0, searches: 0, empty: 0, details: 0, errors4xx: 0, errors5xx: 0, averageMs: null, p95Ms: null },
    traffic: { web: dates.map(() => 0), api: dates.map(() => 0) }, terms: [], companies: [],
    sizes: Object.entries(sizeLabels).map(([band, label]) => ({ band, label, total: 0, values: dates.map(() => 0) })),
    latency: { average: dates.map(() => null), p95: dates.map(() => null) }, errors: { client: dates.map(() => 0), server: dates.map(() => 0) } };
  if (!fs.existsSync(metricsPath())) return result;
  let sqlite: Database.Database | undefined;
  let companyDb: Database.Database | undefined;
  try {
    sqlite = new Database(metricsPath(), { readonly: true, fileMustExist: true, timeout: 100 });
    const args = [dates[0], dates.at(-1)!, filters.channel, filters.channel];
    const where = "day BETWEEN ? AND ? AND (?='all' OR channel=?)";
    const rows = sqlite.prepare(`SELECT day,channel,operation,status,bucket,requests,total_ms AS totalMs,max_ms AS maxMs
      FROM request_daily WHERE ${where} AND operation<>'status'`).all(...args) as RequestRow[];
    const searches = sqlite.prepare(`SELECT day,term,outcome,SUM(requests) AS requests FROM search_daily
      WHERE ${where} AND page_group='first' AND outcome IN ('matched','empty') GROUP BY day,term,outcome`).all(...args) as SearchRow[];
    const sizes = sqlite.prepare(`SELECT day,size_band AS band,SUM(views) AS views FROM company_daily
      WHERE ${where} GROUP BY day,size_band`).all(...args) as SizeRow[];
    const companies = sqlite.prepare(`SELECT company_id AS id,SUM(views) AS views FROM company_daily
      WHERE ${where} AND company_id>0 GROUP BY company_id ORDER BY views DESC,company_id LIMIT 10`).all(...args) as { id: number; views: number }[];
    result.totals = { requests: requests(rows), web: requests(rows.filter((row) => row.channel === "web")), api: requests(rows.filter((row) => row.channel === "api")),
      searches: searches.reduce((sum, row) => sum + row.requests, 0), empty: searches.filter((row) => row.outcome === "empty").reduce((sum, row) => sum + row.requests, 0),
      details: requests(rows.filter((row) => row.operation === "detail" && row.status < 400)),
      errors4xx: requests(rows.filter((row) => row.status >= 400 && row.status < 500)), errors5xx: requests(rows.filter((row) => row.status >= 500)),
      averageMs: average(rows), p95Ms: p95(rows) };
    dates.forEach((day, index) => {
      const daily = rows.filter((row) => row.day === day);
      result.traffic.web[index] = requests(daily.filter((row) => row.channel === "web"));
      result.traffic.api[index] = requests(daily.filter((row) => row.channel === "api"));
      result.latency.average[index] = average(daily);
      result.latency.p95[index] = p95(daily);
      result.errors.client[index] = requests(daily.filter((row) => row.status >= 400 && row.status < 500));
      result.errors.server[index] = requests(daily.filter((row) => row.status >= 500));
      for (const size of result.sizes) size.values[index] = sizes.find((row) => row.day === day && row.band === size.band)?.views ?? 0;
    });
    result.sizes.forEach((row) => { row.total = row.values.reduce((sum, count) => sum + count, 0); });
    const terms = new Map<string, AdminMetrics["terms"][number]>();
    for (const row of searches) {
      if (["[other]", "[redacted]", "[invalid]", "[failed]"].includes(row.term)) continue;
      const term = terms.get(row.term) ?? { term: row.term, total: 0, empty: 0, values: dates.map(() => 0) };
      term.total += row.requests;
      if (row.outcome === "empty") term.empty += row.requests;
      term.values[dates.indexOf(row.day)] += row.requests;
      terms.set(row.term, term);
    }
    result.terms = [...terms.values()].sort((a, b) => b.total - a.total || a.term.localeCompare(b.term, "ko")).slice(0, 10);
    if (fs.existsSync(getDatabasePath())) companyDb = new Database(getDatabasePath(), { readonly: true, fileMustExist: true, timeout: 100 });
    const names = companyDb?.prepare("SELECT name FROM companies WHERE id=?");
    const size = sqlite.prepare(`SELECT size_band AS sizeBand,snapshot_month AS snapshotMonth FROM company_daily
      WHERE ${where} AND company_id=? GROUP BY size_band,snapshot_month ORDER BY SUM(views) DESC,snapshot_month DESC,size_band LIMIT 1`);
    result.companies = companies.map((row) => ({ ...row, name: (names?.get(row.id) as { name: string } | undefined)?.name ?? `사업장 #${row.id}`,
      ...(size.get(...args, row.id) as { sizeBand: string; snapshotMonth: string }) }));
  } catch { result.error = true; }
  finally { sqlite?.close(); companyDb?.close(); }
  return result;
}
