import fs from "node:fs";
import { MetricsStore, metricsPath } from "../lib/usage-metrics";
import Database from "better-sqlite3";
import { getDatabasePath } from "../db/client";

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && !/^[1-9]\d?$/.test(args[0]))) throw new Error("Usage: npm run metrics:report -- [1-90]");
const days = Number(args[0] ?? 30);
if (days > 90) throw new Error("days must be 1-90");
if (!fs.existsSync(metricsPath())) {
  console.log(JSON.stringify({ message: "아직 수집된 메트릭이 없습니다." }));
} else {
  const store = new MetricsStore(metricsPath(), true);
  const companies = fs.existsSync(getDatabasePath()) ? new Database(getDatabasePath(), { readonly: true, fileMustExist: true }) : null;
  try {
    const report = store.report(days);
    const name = companies?.prepare("SELECT name FROM companies WHERE id=?");
    const topCompanies = report.topCompanies.map((value) => {
      const row = value as { companyId: number; channel: string; views: number };
      return { ...row, name: row.companyId === 0 ? "기타 (집계 한도 초과)" : (name?.get(row.companyId) as { name: string } | undefined)?.name ?? null };
    });
    console.log(JSON.stringify({ ...report, topCompanies }, null, 2));
  }
  finally { store.close(); companies?.close(); }
}
