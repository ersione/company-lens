import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { adminCookie, adminSessionSeconds, allowAdminAttempt, allowedAdminOrigin, checkAdminCredentials, createAdminSession, validAdminSession } from "@/lib/admin-auth";
import { MetricsStore, metricDay } from "@/lib/usage-metrics";
import { getAdminMetrics, adminFilters } from "@/lib/admin-metrics";
import { POST as login } from "@/app/admin/session/route";
import { POST as logout } from "@/app/admin/logout/route";

test("stateless admin sessions reject tampering, expiry, password rotation and missing config", () => {
  const saved = { ...process.env };
  try {
    process.env.ADMIN_USER_ID = "test-admin";
    process.env.ADMIN_PASSWORD = "test-password-not-production";
    process.env.COMPANY_LENS_ADMIN_SESSION_SECRET = "test-session-secret-only-01234567890123456789";
    const now = Date.parse("2026-10-12T00:00:00Z");
    const token = createAdminSession(now);
    assert.ok(checkAdminCredentials("test-admin", "test-password-not-production"));
    assert.ok(!checkAdminCredentials("test-admin", "wrong"));
    assert.ok(!checkAdminCredentials("wrong", "test-password-not-production"));
    assert.ok(!checkAdminCredentials("", "test-password-not-production"));
    assert.ok(validAdminSession(token, now));
    assert.ok(!validAdminSession(token, now - 1000));
    assert.ok(!validAdminSession(token, now + adminSessionSeconds * 1000));
    assert.ok(!validAdminSession(`${token}x`, now));
    assert.ok(!validAdminSession(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`, now));
    assert.ok(!validAdminSession(token.replace("v1", "v2"), now));
    assert.ok(!validAdminSession("x".repeat(10000), now));
    process.env.ADMIN_USER_ID = "rotated-admin";
    assert.ok(!validAdminSession(token, now));
    process.env.ADMIN_USER_ID = "test-admin";
    assert.ok(validAdminSession(token, now));
    process.env.ADMIN_PASSWORD = "rotated";
    assert.ok(!validAdminSession(token, now));
    delete process.env.COMPANY_LENS_ADMIN_SESSION_SECRET;
    assert.ok(!validAdminSession(token, now));
    assert.ok(!checkAdminCredentials("test-admin", "rotated"));
  } finally { process.env = saved; }
});

test("login requires both credentials, rejects cross-origin/large input, sets protected cookies, throttles and logs out", async () => {
  const saved = { ...process.env };
  const state = globalThis as typeof globalThis & { companyLensAdminAttempts?: { start: number; count: number } };
  delete state.companyLensAdminAttempts;
  process.env.ADMIN_USER_ID = "fixture-admin";
  process.env.ADMIN_PASSWORD = "fixture-password";
  process.env.COMPANY_LENS_ADMIN_SESSION_SECRET = "fixture-session-secret-012345678901234567890";
  process.env = { ...process.env, NODE_ENV: "production" };
  delete process.env.COMPANY_LENS_ADMIN_ALLOW_LOCAL_HTTP;
  const request = (body: string, origin = "https://companylens.ersione.com") => new Request("http://localhost/admin/session", {
    method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" }, body
  });
  try {
    for (const username of ["fixture-admin"]) {
      const response = await login(request(`username=${username}&password=fixture-password`));
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie")!;
      for (const value of [adminCookie, "HttpOnly", "Secure", "SameSite=strict", "Path=/admin"]) assert.ok(cookie.includes(value));
      assert.ok(!cookie.includes("fixture-password"));
    }
    for (const username of ["anyone", "", "other"]) {
      const response = await login(request(`username=${username}&password=fixture-password`));
      assert.equal(response.status, 401);
      assert.equal(response.headers.get("set-cookie"), null);
    }
    assert.equal((await login(request("username=fixture-admin&password=wrong"))).status, 401);
    assert.equal((await login(request("username=wrong&password=wrong"))).status, 401);
    assert.equal((await login(request("password=fixture-password"))).status, 400);
    assert.equal((await login(request("username=fixture-admin&username=other&password=fixture-password"))).status, 400);
    assert.equal((await login(request("password=fixture-password", "https://evil.example"))).status, 403);
    assert.equal((await login(request("password=fixture-password", "null"))).status, 403);
    assert.equal((await login(request(`password=${"a".repeat(5000)}`))).status, 400);
    assert.equal((await login(request("password=a&password=b"))).status, 400);
    assert.ok(!allowedAdminOrigin(new Request("http://192.168.29.47/admin/session", { headers: { origin: "http://192.168.29.47" } })));
    const local = new Request("http://localhost:3101/admin/session", { headers: { origin: "http://127.0.0.1:3101", host: "127.0.0.1:3101" } });
    assert.ok(!allowedAdminOrigin(local));
    process.env.COMPANY_LENS_ADMIN_ALLOW_LOCAL_HTTP = "1";
    assert.deepEqual(allowedAdminOrigin(local), { secure: false });
    assert.ok(!allowedAdminOrigin(new Request("http://localhost:3101/admin/session", { headers: { origin: "http://evil.example:3101", host: "evil.example:3101" } })));
    const response = await logout(request(""));
    assert.equal(response.status, 200);
    assert.ok(response.headers.get("set-cookie")?.includes("Max-Age=0"));
    delete state.companyLensAdminAttempts;
    for (let i = 0; i < 20; i++) assert.ok(allowAdminAttempt(1000));
    assert.ok(!allowAdminAttempt(1000));
    assert.ok(allowAdminAttempt(61000));
    state.companyLensAdminAttempts = { start: Date.now(), count: 20 };
    assert.equal((await login(request("password=fixture-password"))).status, 429);
    delete process.env.ADMIN_PASSWORD;
    assert.equal((await login(request("password=fixture-password"))).status, 503);
    process.env.ADMIN_PASSWORD = "fixture-password";
    delete process.env.ADMIN_USER_ID;
    assert.equal((await login(request("username=fixture-admin&password=fixture-password"))).status, 503);
  } finally { delete state.companyLensAdminAttempts; process.env = saved; }
});

test("admin metrics surface corrupt storage without leaking diagnostics", () => {
  const previous = process.env.METRICS_DATABASE_URL;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lens-admin-corrupt-"));
  const file = path.join(dir, "corrupt.sqlite");
  fs.writeFileSync(file, "invalid test fixture, not a SQLite database");
  process.env.METRICS_DATABASE_URL = file;
  try {
    const result = getAdminMetrics({ days: 7, channel: "all" });
    assert.equal(result.error, true);
    assert.equal(result.totals.requests, 0);
    assert.ok(!JSON.stringify(result).includes(dir));
  } finally {
    if (previous === undefined) delete process.env.METRICS_DATABASE_URL;
    else process.env.METRICS_DATABASE_URL = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("company ranking retains total views across different observed size bands", () => {
  const saved = { ...process.env };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lens-admin-sizes-"));
  process.env.METRICS_DATABASE_URL = path.join(dir, "metrics.sqlite");
  process.env.DATABASE_URL = path.join(dir, "missing.sqlite");
  const now = Date.parse("2026-10-12T00:00:00Z");
  const store = new MetricsStore(process.env.METRICS_DATABASE_URL);
  try {
    for (const employeeCount of [12, 12, 100]) store.record({ channel: "web", operation: "detail", status: 200,
      durationMs: 100, company: { id: 1, employeeCount, snapshotMonth: "2026-08" } }, now);
    const result = getAdminMetrics({ days: 7, channel: "all" }, now);
    assert.equal(result.companies[0].views, 3);
    assert.equal(result.companies[0].sizeBand, "10-49");
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); process.env = saved; }
});

test("admin metrics filter channels and periods, exclude health/later search pages, weight latency and handle empty storage", () => {
  const saved = { ...process.env };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lens-admin-"));
  process.env.METRICS_DATABASE_URL = path.join(dir, "metrics.sqlite");
  process.env.DATABASE_URL = path.join(dir, "missing-companies.sqlite");
  const now = Date.parse("2026-10-12T00:00:00Z");
  assert.deepEqual(adminFilters({ days: "7", channel: "api" }), { days: 7, channel: "api" });
  assert.deepEqual(adminFilters({ days: "999", channel: ["web", "api"] }), { days: 30, channel: "all" });
  assert.equal(getAdminMetrics({ days: 7, channel: "all" }, now).totals.requests, 0);
  const store = new MetricsStore(process.env.METRICS_DATABASE_URL);
  try {
    store.record({ channel: "api", operation: "status", status: 200, durationMs: 1 }, now);
    store.record({ channel: "web", operation: "search", status: 200, durationMs: 100,
      search: { query: "테스트회사", outcome: "matched", page: 1 } }, now);
    store.record({ channel: "api", operation: "search", status: 200, durationMs: 200,
      search: { query: "없는회사", outcome: "empty", page: 1 } }, now);
    store.record({ channel: "api", operation: "search", status: 200, durationMs: 300,
      search: { query: "테스트회사", outcome: "matched", page: 2 } }, now);
    store.record({ channel: "web", operation: "detail", status: 200, durationMs: 400,
      company: { id: 1, employeeCount: 12, snapshotMonth: "2026-08" } }, now);
    store.record({ channel: "api", operation: "detail", status: 500, durationMs: 500 }, now);
    store.record({ channel: "web", operation: "home", status: 200, durationMs: 1 }, now - 8 * 86400000);
    const data = getAdminMetrics({ days: 7, channel: "all" }, now);
    assert.equal(data.error, false);
    assert.equal(data.dates.at(-1), metricDay(now));
    assert.equal(data.totals.requests, 5);
    assert.equal(data.totals.searches, 2);
    assert.equal(data.totals.empty, 1);
    assert.equal(data.totals.details, 1);
    assert.equal(data.totals.errors5xx, 1);
    assert.equal(data.totals.averageMs, 300);
    assert.equal(data.totals.p95Ms, 500);
    assert.equal(data.companies[0].name, "사업장 #1");
    assert.equal(data.companies[0].sizeBand, "10-49");
    assert.equal(data.sizes.find((row) => row.band === "10-49")?.total, 1);
    assert.equal(getAdminMetrics({ days: 7, channel: "web" }, now).totals.requests, 2);
    assert.equal(getAdminMetrics({ days: 7, channel: "api" }, now).totals.requests, 3);
    assert.equal(getAdminMetrics({ days: 30, channel: "all" }, now).totals.requests, 6);
  } finally { store.close(); fs.rmSync(dir, { recursive: true, force: true }); process.env = saved; }
});
