"use client";

import { useChartTheme } from "@/lib/use-chart-theme";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chart, CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend } from "chart.js";
import type { SnapshotHistory } from "@/lib/company-queries";
import { fillHistoryMonths } from "@/lib/history-series";

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend);
const metrics = [{ key: "employeeCount", label: "가입자 수", tone: "people", unit: "명" },
  { key: "movement", label: "취득·상실", tone: "primary", unit: "명" },
  { key: "estimatedAverageAnnualSalary", label: "추정 평균 연봉", tone: "salary", unit: "만원" }] as const;

export function CompanyHistoryChart({ history }: { history: SnapshotHistory[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const theme = useChartTheme(canvas);
  const [metric, setMetric] = useState<(typeof metrics)[number]["key"]>("employeeCount");
  const [period, setPeriod] = useState(0);
  const [ready, setReady] = useState(false);
  const series = useMemo(() => {
    const all = fillHistoryMonths(history);
    return period ? all.slice(-period) : all;
  }, [history, period]);
  useEffect(() => {
    if (!theme || !canvas.current || !series.length) return;
    let disposed = false;
    let chart: Chart<"line"> | undefined;
    setReady(false);
    const draw = async () => {
    await document.fonts.ready;
    if (disposed || !canvas.current) return;
    const selected = metrics.find(({ key }) => key === metric)!;
    const datasets = metric === "movement" ? [
      { label: "신규취득", data: series.map((row) => row.newJoiners), borderColor: theme.colors.joiners },
      { label: "자격상실", data: series.map((row) => row.departures), borderColor: theme.colors.departures }
    ] : [{ label: selected.label, data: series.map((row) => row[metric] === null ? null
      : metric === "estimatedAverageAnnualSalary" ? Math.round(row[metric]! / 10000) : row[metric]), borderColor: theme.colors[selected.tone] }];
    chart = new Chart(canvas.current, { type: "line",
      data: { labels: series.map(({ snapshotMonth }) => snapshotMonth.replace("-", ".")),
        datasets: datasets.map((dataset) => ({ ...dataset, ...theme.line, pointRadius: series.length > 36 ? 1 : 3 })) },
      options: { font: theme.font, responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { intersect: false, mode: "index" },
        plugins: { legend: { display: metric === "movement", labels: { ...theme.legend, color: theme.colors.label } }, tooltip: { backgroundColor: theme.colors.tooltipBackground, titleColor: theme.colors.tooltipText, bodyColor: theme.colors.tooltipText,
          callbacks: { label: (context) => `${context.dataset.label}: ${context.parsed.y?.toLocaleString("ko-KR") ?? "-"}${selected.unit}` }
        } },
        scales: { x: { grid: { display: false }, border: { display: false },
          ticks: { maxTicksLimit: 6, autoSkipPadding: 20, maxRotation: 0, color: theme.colors.label, font: { size: 12 } } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: theme.colors.grid },
            title: { display: true, text: selected.unit, color: theme.colors.label }, ticks: { precision: 0, color: theme.colors.label, font: { size: 12 } } } }
      } });
    setReady(true);
    };
    void draw();
    return () => { disposed = true; chart?.destroy(); };
  }, [metric, series, theme]);

  return (
    <section className="history-chart-section">
      <div className="chart-heading"><div><h2>월별 고용·급여 추이</h2>
        <p>{history[0]?.snapshotMonth} ~ {history.at(-1)?.snapshotMonth} · {history.length}개월 자료</p></div>
        <div className="segmented-control" aria-label="조회 기간">
          {[12, 36, 0].map((value) => <button key={value} type="button" aria-pressed={period === value}
            onClick={() => setPeriod(value)}>{value ? `${value / 12}년` : "전체"}</button>)}
        </div>
      </div>
      <div className="segmented-control" aria-label="조회 지표">
        {metrics.map(({ key, label }) => <button key={key} type="button" aria-pressed={metric === key}
          onClick={() => setMetric(key)}>{label}</button>)}
      </div>
      {series.length ? <div className="history-chart" data-ready={ready}>
        <canvas ref={canvas} role="img" aria-label={`${metrics.find(({ key }) => key === metric)!.label} 월별 추이`} />
      </div> : <p className="caveat">월별 이력 정보가 없습니다.</p>}
      <p className="caveat">국민연금 가입자 기준입니다. 누락된 월은 연결하지 않으며, 회사명·주소 변경으로 이력이 분리될 수 있습니다. 취득·상실은 실제 입·퇴사와 다를 수 있습니다.</p>
    </section>
  );
}
