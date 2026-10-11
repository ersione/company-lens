import type { SnapshotHistory } from "@/lib/company-queries";
import { percentageChange } from "@/lib/company-metrics";

export function monthOffset(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  return `${Math.floor(index / 12)}-${String((index % 12 + 12) % 12 + 1).padStart(2, "0")}`;
}

export function employmentInsight(history: SnapshotHistory[]) {
  const ordered = [...history].sort((a, b) => a.snapshotMonth.localeCompare(b.snapshotMonth));
  const latest = ordered.at(-1);
  const sorted = latest ? ordered.filter((row) => row.snapshotMonth >= monthOffset(latest.snapshotMonth, -12)) : [];
  const yearAgoMonth = latest ? monthOffset(latest.snapshotMonth, -12) : null;
  const yearAgo = sorted.find((row) => row.snapshotMonth === yearAgoMonth);
  const threeYearsAgoMonth = latest ? monthOffset(latest.snapshotMonth, -36) : null;
  const threeYearsAgo = ordered.find((row) => row.snapshotMonth === threeYearsAgoMonth);
  const twelveMonths = latest ? sorted.filter((row) => row.snapshotMonth > yearAgoMonth!) : [];
  const completeTotal = (field: "newJoiners" | "departures") => twelveMonths.length === 12
    && twelveMonths.every((row) => row[field] !== null) ? twelveMonths.reduce((total, row) => total + row[field]!, 0) : null;
  const threeMonthWindow = latest ? ordered.filter((row) => row.snapshotMonth >= monthOffset(latest.snapshotMonth, -3)) : [];
  const recentThreeMonthChangePercent = threeMonthWindow.length === 4 && threeMonthWindow.every((row) => row.employeeCount !== null)
    ? percentageChange(latest!.employeeCount, threeMonthWindow[0].employeeCount) : null;
  const employeeDelta = latest?.employeeCount != null && yearAgo?.employeeCount != null
    ? latest.employeeCount - yearAgo.employeeCount : null;
  let consecutiveMonths = 0;
  let direction: "up" | "down" | "flat" | null = null;
  for (let index = sorted.length - 1; index > 0; index--) {
    const current = sorted[index], previous = sorted[index - 1];
    if (previous.snapshotMonth !== monthOffset(current.snapshotMonth, -1)
      || current.employeeCount === null || previous.employeeCount === null) break;
    const next = current.employeeCount > previous.employeeCount ? "up" : current.employeeCount < previous.employeeCount ? "down" : "flat";
    if (direction !== null && direction !== next) break;
    direction = next;
    consecutiveMonths++;
  }
  return { snapshotMonth: latest?.snapshotMonth ?? null, yearAgoMonth,
    employeeDelta, employeeChangePercent: percentageChange(latest?.employeeCount ?? null, yearAgo?.employeeCount),
    annualSalaryChangePercent: percentageChange(latest?.estimatedAverageAnnualSalary ?? null, yearAgo?.estimatedAverageAnnualSalary),
    threeYearsAgoMonth, threeYearsAgoEmployeeCount: threeYearsAgo?.employeeCount ?? null,
    latestEmployeeCount: latest?.employeeCount ?? null,
    threeYearEmployeeDelta: latest?.employeeCount != null && threeYearsAgo?.employeeCount != null
      ? latest.employeeCount - threeYearsAgo.employeeCount : null,
    threeYearEmployeeChangePercent: percentageChange(latest?.employeeCount ?? null, threeYearsAgo?.employeeCount),
    twelveMonthNewJoiners: completeTotal("newJoiners"), twelveMonthDepartures: completeTotal("departures"),
    movementMonths: twelveMonths.length, recentThreeMonthChangePercent,
    consecutiveMonths, direction };
}

export function employmentNarrative(insight: ReturnType<typeof employmentInsight>) {
  const change = (value: number) => value === 0 ? "변동 없음" : `${Math.abs(value).toFixed(1)}% ${value > 0 ? "증가" : "감소"}`;
  const parts = [];
  if (insight.employeeChangePercent !== null) parts.push(`최근 1년 가입자 ${change(insight.employeeChangePercent)}`);
  if (insight.recentThreeMonthChangePercent !== null) parts.push(`최근 3개월 ${change(insight.recentThreeMonthChangePercent)}`);
  return parts.length ? `${parts.join(" · ")}.` : "고용 변화를 요약할 비교 자료가 부족합니다.";
}

export function relatedNameQuery(name: string) {
  const value = name.replace(/주식회사|유한회사|유한책임회사|\(주\)|\(유\)|㈜/g, " ")
    .replace(/\([^)]*\)/g, " ").trim().split(/\s+/)[0] ?? "";
  return [...value].length >= 3 && !/[%_\p{Cc}]/u.test(value) ? [...value].slice(0, 100).join("") : null;
}

export function parseComparisonIds(value: string | undefined, minimum = 1): { ids: number[]; error: string | null } {
  const parts = value ? value.split(",") : [];
  if (parts.length < minimum || parts.length > 3 || parts.some((part) => !/^[1-9]\d*$/.test(part)
    || !Number.isSafeInteger(Number(part))) || new Set(parts).size !== parts.length) {
    return { ids: [], error: `서로 다른 사업장 ID를 ${minimum}~3개 지정하세요.` };
  }
  return { ids: parts.map(Number), error: null };
}
