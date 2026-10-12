import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { MetricsStore, metricDay, metricSearchTerm, metricSize, recordUsage, skipWebMetrics, type UsageEvent } from "@/lib/usage-metrics";
import { observedApiResponse } from "@/lib/observe-usage";

const now = Date.parse("2026-10-11T16:00:00Z");
const sample: UsageEvent = { channel: "web", operation: "detail", status: 200, durationMs: 35,
  company: { id: 1, employeeCount: 12, snapshotMonth: "2026-08" } };

test("metrics use KST, normalize company terms, redact contact/number searches and classify subscriber size", () => {
  assert.equal(metricDay(now), "2026-10-12");
  assert.equal(metricDay(Date.parse("2026-10-11T14:59:59Z")), "2026-10-11");
  assert.equal(metricSearchTerm("  SAMSUNG   전자 "), "samsung 전자");
  assert.equal(metricSearchTerm(" 티빙 "), "티빙");
  assert.equal(metricSearchTerm("ab"), "ab");
  for (const query of ["12", "1-2", "123-45-67890", "01012345678", "abc@example.com", "https://abc.com", "회사 010-1234-5678", "a", "abc%", "abc\u0000"]) assert.equal(metricSearchTerm(query), null);
  assert.deepEqual([null, -1, 0, 1, 9, 10, 49, 50, 299, 300, 999, 1000].map(metricSize),
    ["unknown", "unknown", "0", "1-9", "1-9", "10-49", "10-49", "50-299", "50-299", "300-999", "300-999", "1000+"]);
  const skippedHeaders: Record<string, string>[] = [{ "next-router-prefetch": "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }, { "user-agent": "Slackbot" }];
  for (const value of skippedHeaders) assert.equal(skipWebMetrics(new Headers(value)), true);
  assert.equal(skipWebMetrics(new Headers({ "user-agent": "Mozilla/5.0 Chrome/142" })), false);
});

test("daily aggregates separate channels, preserve size at view time, report latency/errors, and expire old rows", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lens-metrics-"));
  const file = path.join(dir, "metrics.sqlite");
  const store = new MetricsStore(file);
  try {
    store.record(sample, now - 91 * 86400000);
    store.record({ ...sample, search: { query: "삼성전자", page: 1, outcome: "matched" } }, now);
    store.record({ ...sample, durationMs: 150, company: { ...sample.company!, employeeCount: 300 } }, now);
    store.record({ channel: "api", operation: "search", status: 200, durationMs: 10,
      search: { query: "없는회사", page: 2, outcome: "empty" } }, now);
    store.record({ channel: "api", operation: "search", status: 400, durationMs: 1,
      search: { query: "private@example.com", page: 1, outcome: "invalid" } }, now);
    store.record({ channel: "api", operation: "search", status: 500, durationMs: 200,
      search: { query: "private@example.com", page: 1, outcome: "failed" } }, now);
    const report = store.report(30, now);
    assert.equal(report.dailyRequests.reduce((sum, row) => sum + row.requests, 0), 5);
    assert.deepEqual(report.topCompanies, [{ channel: "web", companyId: 1, views: 2 }]);
    assert.equal(report.sizeTrends.length, 2);
    const perf = report.performance.find((row) => row.operation === "api:search")!;
    assert.equal(perf.errors4xx, 1);
    assert.equal(perf.errors5xx, 1);
    assert.equal(perf.serverErrorRate, 1 / 3);
    assert.equal(perf.p95UpperMs, 250);
    assert.equal(perf.maxMs, 200);
    assert.ok(!JSON.stringify(report).includes("private@example.com"));
    const db = new Database(file, { readonly: true });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM request_daily WHERE day < '2026-10-12'").get() as { n: number }).n, 0);
    db.close();
    assert.throws(() => store.report(91, now));
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("search and company cardinality overflow stays aggregated instead of growing per distinct input", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lens-metrics-cap-"));
  const file = path.join(dir, "metrics.sqlite");
  const store = new MetricsStore(file);
  try {
    for (let id = 1; id <= 2010; id++) store.record({ ...sample, company: { ...sample.company!, id },
      search: { query: `회사이름${id}`, page: 1, outcome: "matched" } }, now);
    const db = new Database(file, { readonly: true });
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM search_daily").get() as { n: number }).n, 1001);
    assert.equal((db.prepare("SELECT views FROM company_daily WHERE company_id=0").get() as { views: number }).views, 10);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM company_daily").get() as { n: number }).n, 2001);
    db.close();
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("API observation defers writes, does not change cache/response, separates details from history, and fails open", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lens-observe-"));
  const previous = process.env.METRICS_DATABASE_URL;
  process.env.METRICS_DATABASE_URL = path.join(dir, "metrics.sqlite");
  const callbacks: (() => void)[] = [];
  const scheduler = (callback: () => void) => { callbacks.push(callback); };
  try {
    const req = new Request("http://localhost/api/v1/companies/1");
    const data = { id: 1, employeeCount: 30, snapshotMonth: "2026-08" };
    const response = observedApiResponse(req, "detail", () => data, scheduler);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "public, max-age=60");
    assert.deepEqual((await response.json()).data, data);
    assert.equal(fs.existsSync(process.env.METRICS_DATABASE_URL!), false);
    observedApiResponse(req, "history", () => ({ companyId: 1 }), scheduler);
    observedApiResponse(req, "search", () => ({ query: "삼성전자", page: 2, totalCount: 20 }), scheduler);
    const originalError = console.error;
    console.error = () => {};
    try { assert.equal(observedApiResponse(req, "detail", () => { throw new Error("secret"); }, scheduler).status, 500); }
    finally { console.error = originalError; }
    callbacks.forEach((callback) => callback());
    const store = new MetricsStore(process.env.METRICS_DATABASE_URL!, true);
    const report = store.report();
    assert.equal(report.topCompanies.length, 1);
    assert.equal((report.topCompanies[0] as { views: number }).views, 1);
    assert.equal((report.searchTrends[0] as { pageGroup: string }).pageGroup, "later");
    assert.equal(report.performance.find((row) => row.operation === "api:detail")?.errors5xx, 1);
    store.close();
    assert.equal(observedApiResponse(req, "detail", () => data, () => { throw new Error("scheduler down"); }).status, 200);
    process.env.METRICS_DATABASE_URL = dir;
    assert.doesNotThrow(() => recordUsage(sample));
  } finally {
    if (previous === undefined) delete process.env.METRICS_DATABASE_URL;
    else process.env.METRICS_DATABASE_URL = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
