"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Chart, CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend, Filler } from "chart.js";
import type { StatisticsRow } from "@/lib/public-statistics";
import { monthOffset } from "@/lib/company-insights";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend, Filler);
const metrics = [
  { key: "subscriberCount", label: "가입자 수", color: "#0f766e", unit: "명" },
  { key: "workplaceCount", label: "사업장 수", color: "#2563eb", unit: "개" },
  { key: "annualSalary", label: "추정 평균 연봉", color: "#a16207", unit: "만원" },
  { key: "movement", label: "취득·상실", color: "#b45352", unit: "명" }
] as const;

export function StatisticsChart({ history }: { history: StatisticsRow[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [metric, setMetric] = useState<(typeof metrics)[number]["key"]>("subscriberCount");
  const [period, setPeriod] = useState(36);
  const [ready, setReady] = useState(false);
  const series = useMemo(() => {
    if (!history.length) return [];
    const byMonth = new Map(history.map((row) => [row.month, row]));
    const start = period ? [history[0].month, monthOffset(history.at(-1)!.month, -(period - 1))].sort().at(-1)! : history[0].month;
    const result: { month: string; row: StatisticsRow | undefined }[] = [];
    for (let month = start; month <= history.at(-1)!.month; month = monthOffset(month, 1)) {
      result.push({ month, row: byMonth.get(month) });
    }
    return result;
  }, [history, period]);
  useEffect(() => {
    if (!canvas.current || !series.length) return;
    let disposed = false;
    let chart: Chart<"line"> | undefined;
    setReady(false);
    void document.fonts.ready.then(() => {
      if (disposed || !canvas.current) return;
      const selected = metrics.find(({ key }) => key === metric)!;
      const datasets = metric === "movement" ? [
        { label: "신규취득", data: series.map(({ row }) => row?.newJoiners ?? null), borderColor: "#2563eb" },
        { label: "자격상실", data: series.map(({ row }) => row?.departures ?? null), borderColor: "#b45352" }
      ] : [{ label: selected.label, borderColor: selected.color,
        data: series.map(({ row }) => !row ? null : metric === "annualSalary"
          ? row.annualSalary === null ? null : Math.round(row.annualSalary / 10000) : row[metric]) }];
      chart = new Chart(canvas.current, { type: "line", data: {
        labels: series.map(({ month }) => month.replace("-", ".")),
        datasets: datasets.map((dataset) => ({ ...dataset, backgroundColor: `${dataset.borderColor}12`,
          fill: metric !== "movement", borderWidth: 2, pointRadius: series.length > 36 ? 0 : 2,
          pointHitRadius: 14, spanGaps: false })) }, options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        font: { family: '"Noto Sans KR Variable", sans-serif' },
        interaction: { intersect: false, mode: "index" },
        plugins: { legend: { display: metric === "movement" }, tooltip: { callbacks: {
          label: (context) => `${context.dataset.label}: ${context.parsed.y?.toLocaleString("ko-KR") ?? "-"}${selected.unit}`
        } } }, scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0 }, border: { display: false } },
          y: { beginAtZero: true, title: { display: true, text: selected.unit }, grid: { color: "#edf0f3" }, border: { display: false } }
        }
      } });
      setReady(true);
    });
    return () => { disposed = true; chart?.destroy(); };
  }, [metric, series]);
  return <section className="statistics-trend">
    <div className="chart-heading"><div><h2>월별 추이</h2><p>{history[0]?.month} — {history.at(-1)?.month} · {history.length}개월</p></div>
      <div className="segmented-control" aria-label="통계 조회 기간">
        {[12, 36, 0].map((value) => <button type="button" key={value} aria-pressed={period === value}
          onClick={() => setPeriod(value)}>{value ? `${value / 12}년` : "전체"}</button>)}
      </div>
    </div>
    <div className="segmented-control statistics-metrics" aria-label="통계 조회 지표">
      {metrics.map(({ key, label }) => <button type="button" key={key} aria-pressed={metric === key}
        onClick={() => setMetric(key)}>{label}</button>)}
    </div>
    <div className="statistics-canvas" data-ready={ready}><canvas ref={canvas} role="img"
      aria-label={`${metrics.find(({ key }) => key === metric)!.label} 월별 통계 추이`} /></div>
  </section>;
}
