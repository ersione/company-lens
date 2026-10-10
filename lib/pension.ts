export const PENSION_RATE_SOURCE_URL = "https://www.nps.or.kr/pnsinfo/ntpsklg/getOHAF0016M0.do";

// SQL counterpart of estimateSalary, used only for the few rows returned by a page.
export function estimatedMonthlySalarySql(alias: string) {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  const rate = `((90 + MIN(8, MAX(0, CAST(SUBSTR(${alias}.snapshot_month, 1, 4) AS INTEGER) - 2025)) * 5) / 1000.0)`;
  return `CASE WHEN ${alias}.employee_count > 0 THEN CAST(ROUND(${alias}.monthly_billed_amount * 1.0 / ${alias}.employee_count / ${rate}) AS INTEGER) END`;
}

export function pensionRateForMonth(snapshotMonth: string) {
  const year = Number(snapshotMonth.slice(0, 4));
  return (90 + Math.min(8, Math.max(0, year - 2025)) * 5) / 1000;
}

export function estimateSalary(monthlyBilledAmount: number | null, employeeCount: number | null, snapshotMonth = "2025-01") {
  if (monthlyBilledAmount === null || employeeCount === null || employeeCount <= 0) {
    return { estimatedAverageMonthlySalary: null, estimatedAverageAnnualSalary: null };
  }
  const estimatedAverageMonthlySalary = Math.round(monthlyBilledAmount / employeeCount / pensionRateForMonth(snapshotMonth));
  return { estimatedAverageMonthlySalary, estimatedAverageAnnualSalary: estimatedAverageMonthlySalary * 12 };
}
