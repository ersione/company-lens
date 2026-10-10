import type { SnapshotHistory } from "@/lib/company-queries";

export function previousMonthSnapshot(history: SnapshotHistory[], month: string | null) {
  if (!month) return undefined;
  const [year, number] = month.split("-").map(Number);
  const previous = number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, "0")}`;
  return history.find((snapshot) => snapshot.snapshotMonth === previous);
}

export function percentageChange(current: number | null, previous: number | null | undefined) {
  if (current === null || previous == null || previous === 0) return null;
  return (current - previous) / previous * 100;
}

export function netSubscribers(joiners: number | null, departures: number | null) {
  return joiners === null || departures === null ? null : joiners - departures;
}
