import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { validateCompanySearch } from "./company-search-input";

export type UsageEvent = {
  channel: "web" | "api";
  operation: "home" | "search" | "detail" | "history" | "insights" | "compare" | "status";
  status: number;
  durationMs: number;
  search?: { query: string; page: number; outcome: "matched" | "empty" | "invalid" | "failed" };
  company?: { id: number; employeeCount: number | null; snapshotMonth: string | null };
};

export const metricRetentionDays = 90;
export const latencyBounds = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 60000, 3600000];
const dayMs = 86400000;
const other = "[other]";
export const metricDay = (now = Date.now()) => new Date(now + 9 * 3600000).toISOString().slice(0, 10);
export const metricsPath = () => process.env.METRICS_DATABASE_URL?.replace(/^file:/, "")
  ?? path.join(process.cwd(), "data", "db", "usage-metrics.sqlite");

export function metricSearchTerm(value: string) {
  const { query, error } = validateCompanySearch(value);
  if (error || /^[\d\s-]+$/.test(query) || /[@:/\\]|\d[\d\s()-]{6,}\d/.test(query)) return null;
  return query.normalize("NFC").replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function metricSize(count: number | null) {
  if (count === null || !Number.isFinite(count) || count < 0) return "unknown";
  if (count === 0) return "0";
  if (count < 10) return "1-9";
  if (count < 50) return "10-49";
  if (count < 300) return "50-299";
  if (count < 1000) return "300-999";
  return "1000+";
}

export function skipWebMetrics(headers: Pick<Headers, "get">) {
  return headers.get("next-router-prefetch") === "1"
    || /prefetch/i.test(`${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""}`)
    || /bot|crawler|spider|slurp|facebookexternalhit|kakaotalk|headless/i.test(headers.get("user-agent") ?? "");
}

type RequestRow = { day: string; channel: string; operation: string; status: number; bucket: number; requests: number; totalMs: number; maxMs: number };

export class MetricsStore {
  private sqlite: Database.Database;
  private prunedDay = "";

  constructor(file: string, readonly = false) {
    if (!readonly) fs.mkdirSync(path.dirname(file), { recursive: true });
    this.sqlite = new Database(file, { readonly, fileMustExist: readonly, timeout: 25 });
    if (readonly) return;
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS request_daily (
        day TEXT NOT NULL, channel TEXT NOT NULL, operation TEXT NOT NULL, status INTEGER NOT NULL,
        bucket INTEGER NOT NULL, requests INTEGER NOT NULL, total_ms REAL NOT NULL, max_ms REAL NOT NULL,
        PRIMARY KEY(day, channel, operation, status, bucket)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS search_daily (
        day TEXT NOT NULL, channel TEXT NOT NULL, term TEXT NOT NULL, page_group TEXT NOT NULL,
        outcome TEXT NOT NULL, requests INTEGER NOT NULL,
        PRIMARY KEY(day, channel, term, page_group, outcome)
      ) WITHOUT ROWID;
      CREATE TABLE IF NOT EXISTS company_daily (
        day TEXT NOT NULL, channel TEXT NOT NULL, company_id INTEGER NOT NULL, size_band TEXT NOT NULL,
        snapshot_month TEXT NOT NULL, views INTEGER NOT NULL,
        PRIMARY KEY(day, channel, company_id, size_band, snapshot_month)
      ) WITHOUT ROWID;
    `);
  }

  record(event: UsageEvent, now = Date.now()) {
    const day = metricDay(now);
    const ms = Number.isFinite(event.durationMs) ? Math.max(0, Math.min(event.durationMs, 3600000)) : 0;
    const bucket = latencyBounds.find((bound) => ms <= bound)!;
    const prune = this.prunedDay !== day;
    this.sqlite.transaction(() => {
      if (prune) {
        const cutoff = metricDay(now - (metricRetentionDays - 1) * dayMs);
        for (const table of ["request_daily", "search_daily", "company_daily"]) {
          this.sqlite.prepare(`DELETE FROM ${table} WHERE day < ?`).run(cutoff);
        }
      }
      this.sqlite.prepare(`INSERT INTO request_daily VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(day,channel,operation,status,bucket) DO UPDATE SET requests=requests+1,
        total_ms=total_ms+excluded.total_ms, max_ms=MAX(max_ms,excluded.max_ms)`)
        .run(day, event.channel, event.operation, event.status, bucket, ms, ms);
      if (event.search) {
        let term = event.search.outcome === "invalid" || event.search.outcome === "failed"
          ? `[${event.search.outcome}]` : metricSearchTerm(event.search.query) ?? "[redacted]";
        const page = event.search.page > 1 ? "later" : "first";
        const exists = this.sqlite.prepare(`SELECT 1 FROM search_daily WHERE day=? AND channel=? AND term=? AND page_group=? AND outcome=?`)
          .get(day, event.channel, term, page, event.search.outcome);
        if (!exists && (this.sqlite.prepare("SELECT COUNT(*) AS n FROM search_daily WHERE day=?").get(day) as { n: number }).n >= 1000) term = other;
        this.sqlite.prepare(`INSERT INTO search_daily VALUES (?, ?, ?, ?, ?, 1)
          ON CONFLICT(day,channel,term,page_group,outcome) DO UPDATE SET requests=requests+1`)
          .run(day, event.channel, term, page, event.search.outcome);
      }
      if (event.company && event.operation === "detail" && event.status < 400) {
        let id = event.company.id;
        if (!Number.isSafeInteger(id) || id <= 0) return;
        const size = metricSize(event.company.employeeCount);
        const month = event.company.snapshotMonth ?? "";
        const exists = this.sqlite.prepare(`SELECT 1 FROM company_daily WHERE day=? AND channel=? AND company_id=? AND size_band=? AND snapshot_month=?`)
          .get(day, event.channel, id, size, month);
        if (!exists && (this.sqlite.prepare("SELECT COUNT(*) AS n FROM company_daily WHERE day=?").get(day) as { n: number }).n >= 2000) id = 0;
        this.sqlite.prepare(`INSERT INTO company_daily VALUES (?, ?, ?, ?, ?, 1)
          ON CONFLICT(day,channel,company_id,size_band,snapshot_month) DO UPDATE SET views=views+1`)
          .run(day, event.channel, id, size, month);
      }
    })();
    if (prune) this.prunedDay = day;
  }

  report(days = 30, now = Date.now()) {
    if (!Number.isInteger(days) || days < 1 || days > metricRetentionDays) throw new Error("days must be 1-90");
    const from = metricDay(now - (days - 1) * dayMs);
    const to = metricDay(now);
    const rows = this.sqlite.prepare(`SELECT day,channel,operation,status,bucket,requests,total_ms AS totalMs,max_ms AS maxMs
      FROM request_daily WHERE day BETWEEN ? AND ? ORDER BY day,channel,operation,status,bucket`).all(from, to) as RequestRow[];
    const operations = new Map<string, RequestRow[]>();
    for (const row of rows) {
      const key = `${row.channel}:${row.operation}`;
      const values = operations.get(key) ?? [];
      values.push(row);
      operations.set(key, values);
    }
    const performance = [...operations].map(([operation, values]) => {
      const requests = values.reduce((sum, row) => sum + row.requests, 0);
      const errors4xx = values.filter((row) => row.status >= 400 && row.status < 500).reduce((sum, row) => sum + row.requests, 0);
      const errors5xx = values.filter((row) => row.status >= 500).reduce((sum, row) => sum + row.requests, 0);
      const percentile = (p: number) => {
        let cumulative = 0;
        for (const bound of latencyBounds) {
          cumulative += values.filter((row) => row.bucket === bound).reduce((sum, row) => sum + row.requests, 0);
          if (cumulative >= Math.ceil(requests * p)) return bound;
        }
        return null;
      };
      return { operation, requests, errors4xx, errors5xx, serverErrorRate: errors5xx / requests,
        averageMs: values.reduce((sum, row) => sum + row.totalMs, 0) / requests,
        maxMs: Math.max(...values.map((row) => row.maxMs)), p50UpperMs: percentile(0.5), p95UpperMs: percentile(0.95) };
    });
    return { timezone: "Asia/Seoul", from, to, retentionDays: metricRetentionDays, performance,
      dailyRequests: rows,
      searchSummary: this.sqlite.prepare(`SELECT channel,page_group AS pageGroup,
        SUM(CASE WHEN outcome='matched' THEN requests ELSE 0 END) AS matched,
        SUM(CASE WHEN outcome='empty' THEN requests ELSE 0 END) AS empty,
        SUM(CASE WHEN outcome='invalid' THEN requests ELSE 0 END) AS invalid,
        SUM(CASE WHEN outcome='failed' THEN requests ELSE 0 END) AS failed
        FROM search_daily WHERE day BETWEEN ? AND ? GROUP BY channel,page_group ORDER BY channel,page_group`).all(from, to),
      searchTrends: this.sqlite.prepare(`SELECT day,channel,term,page_group AS pageGroup,outcome,requests FROM search_daily
        WHERE day BETWEEN ? AND ? ORDER BY day,requests DESC`).all(from, to),
      topCompanies: this.sqlite.prepare(`SELECT channel,company_id AS companyId,SUM(views) AS views FROM company_daily
        WHERE day BETWEEN ? AND ? GROUP BY channel,company_id ORDER BY views DESC LIMIT 100`).all(from, to),
      companySizeBreakdown: this.sqlite.prepare(`SELECT channel,company_id AS companyId,size_band AS sizeBand,
        snapshot_month AS snapshotMonth,SUM(views) AS views FROM company_daily
        WHERE day BETWEEN ? AND ? GROUP BY channel,company_id,size_band,snapshot_month ORDER BY views DESC LIMIT 100`).all(from, to),
      sizeTrends: this.sqlite.prepare(`SELECT day,channel,size_band AS sizeBand,SUM(views) AS views FROM company_daily
        WHERE day BETWEEN ? AND ? GROUP BY day,channel,size_band ORDER BY day,channel,size_band`).all(from, to) };
  }

  close() { this.sqlite.close(); }
}

let store: MetricsStore | undefined;
let storePath: string | undefined;
let lastWarning = 0;
export function recordUsage(event: UsageEvent) {
  if (process.env.METRICS_DISABLED === "1") return;
  try {
    const file = metricsPath();
    if (!store || storePath !== file) {
      store?.close();
      store = undefined;
      store = new MetricsStore(file);
      storePath = file;
    }
    store.record(event);
  } catch {
    if (Date.now() - lastWarning > 60000) {
      console.warn("Company Lens metrics unavailable; request handling is unaffected.");
      lastWarning = Date.now();
    }
  }
}
