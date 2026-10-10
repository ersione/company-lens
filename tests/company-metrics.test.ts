import assert from "node:assert/strict";
import test from "node:test";
import { netSubscribers, percentageChange, previousMonthSnapshot } from "@/lib/company-metrics";
import type { SnapshotHistory } from "@/lib/company-queries";

test("detail comparisons use only the immediately preceding calendar month", () => {
  const row = (snapshotMonth: string): SnapshotHistory => ({ snapshotMonth, employeeCount: 10,
    estimatedAverageAnnualSalary: 100, newJoiners: 0, departures: 0 });
  const history = [row("2025-11"), row("2025-12"), row("2026-02")];
  assert.equal(previousMonthSnapshot(history, "2026-01")?.snapshotMonth, "2025-12");
  assert.equal(previousMonthSnapshot(history, "2026-02"), undefined);
  assert.equal(previousMonthSnapshot(history, null), undefined);
});

test("detail metrics preserve missing values and avoid division by zero", () => {
  assert.equal(percentageChange(110, 100), 10);
  assert.equal(percentageChange(100, 0), null);
  assert.equal(percentageChange(null, 100), null);
  assert.equal(percentageChange(100, undefined), null);
  assert.equal(netSubscribers(32, 55), -23);
  assert.equal(netSubscribers(0, 0), 0);
  assert.equal(netSubscribers(null, 0), null);
  assert.equal(netSubscribers(0, null), null);
});
