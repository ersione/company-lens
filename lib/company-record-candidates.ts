import type Database from "better-sqlite3";
import { canonicalSnapshotSql } from "@/lib/company-latest";

export type CompanyRecordCandidate = {
  id: number; name: string; firstMonth: string; lastMonth: string;
  direction: "earlier" | "later";
};

function similarNames(left: string, right: string) {
  const grams = (value: string) => {
    const name = value.replace(/주식회사|유한회사|\(주\)|\(유\)|[^가-힣a-z0-9]/gi, "").toLowerCase();
    return new Set(Array.from({ length: Math.max(0, name.length - 2) }, (_, i) => name.slice(i, i + 3)));
  };
  const a = grams(left), b = grams(right);
  const shared = [...a].filter((gram) => b.has(gram)).length;
  return shared >= 3 && 2 * shared / (a.size + b.size) >= 0.5;
}

function followingMonth(month: string) {
  const [year, number] = month.split("-").map(Number);
  return number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
}

export function findCompanyRecordCandidates(sqlite: Database.Database, id: number): CompanyRecordCandidate[] {
  const company = sqlite.prepare(`SELECT name, registration_number AS registrationNumber, address
    FROM companies WHERE id = ?`).get(id) as { name: string; registrationNumber: string | null; address: string | null } | undefined;
  if (!company?.address?.trim() || !company.registrationNumber || !/^\d{3,10}$/.test(company.registrationNumber)) return [];
  if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'company_search'").get()) return [];
  // Reuse the provisioned FTS index; never scan all companies or build an index in a request.
  const pool = sqlite.prepare(`SELECT c.id, c.name FROM company_search
    JOIN companies c ON c.id = company_search.rowid
    WHERE company_search MATCH ? AND c.registration_number = ? AND c.address = ? AND c.id != ?
    ORDER BY c.id LIMIT 51`).all(`registration_number : "${company.registrationNumber}"`, company.registrationNumber, company.address, id) as { id: number; name: string }[];
  if (pool.length > 50) return [];
  const first = sqlite.prepare(`SELECT s2.snapshot_month AS month FROM company_snapshots s2
    WHERE s2.company_id = ? AND ${canonicalSnapshotSql} ORDER BY s2.snapshot_month, s2.id LIMIT 1`);
  const last = sqlite.prepare(`SELECT s2.snapshot_month AS month FROM company_snapshots s2
    WHERE s2.company_id = ? AND ${canonicalSnapshotSql} ORDER BY s2.snapshot_month DESC, s2.id DESC LIMIT 1`);
  const range = (companyId: number) => {
    const start = first.get(companyId) as { month: string } | undefined;
    const end = last.get(companyId) as { month: string } | undefined;
    return start && end ? { firstMonth: start.month, lastMonth: end.month } : null;
  };
  const current = range(id);
  if (!current) return [];
  return pool.flatMap((row): CompanyRecordCandidate[] => {
    if (!similarNames(company.name, row.name)) return [];
    const period = range(row.id);
    if (!period) return [];
    const direction = followingMonth(period.lastMonth) === current.firstMonth ? "earlier"
      : followingMonth(current.lastMonth) === period.firstMonth ? "later" : null;
    return direction ? [{ ...row, ...period, direction }] : [];
  }).slice(0, 6);
}
