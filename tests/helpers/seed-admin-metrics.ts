import { MetricsStore } from "../../lib/usage-metrics";

const file = process.env.ADMIN_FIXTURE_PATH;
if (!file) throw new Error("ADMIN_FIXTURE_PATH is required; never seed production metrics.");
const store = new MetricsStore(file);
try {
  for (let day = 6; day >= 0; day--) {
    const now = Date.now() - day * 86400000;
    for (let i = 0; i < 24 + (6 - day) * 5; i++) {
      store.record({ channel: i % 3 ? "web" : "api", operation: "search", status: 200, durationMs: 40 + i * 2,
        search: { query: ["삼성전자", "현대자동차", "메트릭표본회사"][i % 3], page: 1, outcome: i % 7 ? "matched" : "empty" } }, now);
      store.record({ channel: i % 4 ? "web" : "api", operation: "detail", status: 200, durationMs: 60 + i * 3,
        company: { id: i % 2 ? 4270 : 177744, employeeCount: [0, 5, 24, 75, 400, 2000, null][i % 7], snapshotMonth: "2026-08" } }, now);
    }
    store.record({ channel: "api", operation: "detail", status: 500, durationMs: 1100 + day * 40 }, now);
    store.record({ channel: "api", operation: "search", status: 400, durationMs: 5, search: { query: "", page: 1, outcome: "invalid" } }, now);
  }
} finally { store.close(); }
