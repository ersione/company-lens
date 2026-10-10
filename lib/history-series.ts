import type { SnapshotHistory } from "@/lib/company-queries";

export function fillHistoryMonths(history: SnapshotHistory[]) {
  if (!history.length) return [];
  const byMonth = new Map(history.map((snapshot) => [snapshot.snapshotMonth, snapshot]));
  const months = [...byMonth.keys()].sort();
  const result: SnapshotHistory[] = [];
  let [year, month] = months[0].split("-").map(Number);
  for (let iterations = 0; iterations < 2400; iterations++) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    if (key > months.at(-1)!) break;
    result.push(byMonth.get(key) ?? { snapshotMonth: key, employeeCount: null,
      estimatedAverageAnnualSalary: null, newJoiners: null, departures: null });
    if (++month > 12) { year++; month = 1; }
  }
  return result;
}
