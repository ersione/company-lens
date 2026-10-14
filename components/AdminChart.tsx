"use client";

import { useChartTheme } from "@/lib/use-chart-theme";
import { useEffect, useRef, useState } from "react";
import { Chart, CategoryScale, LinearScale, LineController, LineElement, PointElement, BarController, BarElement, Tooltip, Legend } from "chart.js";
Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, BarController, BarElement, Tooltip, Legend);
type Series = { label: string; values: (number | null)[]; color: number | "error" | "warning" | "neutral" | "ink" };

export function AdminChart({ title, labels, series, kind = "line", horizontal = false, stacked = false, unit = "건" }:
  { title: string; labels: string[]; series: Series[]; kind?: "line" | "bar"; horizontal?: boolean; stacked?: boolean; unit?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const theme = useChartTheme(ref);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!theme) return;
    let disposed = false;
    let chart: Chart | undefined;
    setReady(false);
    void document.fonts.ready.then(() => {
      if (disposed || !ref.current) return;
      const colorFor = (color: Series["color"]) => typeof color === "number"
        ? theme.series[color % theme.series.length]
        : color === "neutral" ? theme.colors.label : color === "ink" ? theme.colors.tooltipBackground : theme.colors[color];
      chart = new Chart(ref.current, { type: kind,
        data: { labels, datasets: series.map((row) => ({ label: row.label, data: row.values,
          borderColor: colorFor(row.color), backgroundColor: colorFor(row.color), borderWidth: kind === "line" ? theme.line.borderWidth : 0,
          pointRadius: labels.length <= 7 ? 3 : 1, pointHitRadius: 10, spanGaps: false, borderRadius: kind === "bar" ? 3 : 0, maxBarThickness: 28 })) },
        options: { responsive: true, maintainAspectRatio: false, animation: false, indexAxis: horizontal ? "y" : "x",
          interaction: { intersect: false, mode: horizontal ? "nearest" : "index" },
          font: theme.font,
          plugins: { legend: { display: series.length > 1, position: "bottom", labels: { ...theme.legend, color: theme.colors.label, font: { size: 12 },
            generateLabels: (chart) => Chart.defaults.plugins.legend.labels.generateLabels(chart).map((item) => ({ ...item, text: item.text.length > 18 ? `${item.text.slice(0, 17)}…` : item.text })) } },
            tooltip: { backgroundColor: theme.colors.tooltipBackground, titleColor: theme.colors.tooltipText, bodyColor: theme.colors.tooltipText, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${Number(horizontal ? ctx.parsed.x : ctx.parsed.y).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}${unit}` } } },
          scales: { x: { stacked, beginAtZero: true, border: { display: false }, grid: { display: horizontal }, ticks: {
            color: theme.colors.label, maxRotation: 0, maxTicksLimit: horizontal ? 5 : 7,
            callback: horizontal ? undefined : function (value) { const text = this.getLabelForValue(Number(value)); return text.length > 16 ? `${text.slice(0, 15)}…` : text; } } },
            y: { stacked, beginAtZero: true, border: { display: false }, grid: { color: theme.colors.grid, display: !horizontal }, ticks: {
              color: theme.colors.label, precision: 0, callback: horizontal ? function (value) { const text = this.getLabelForValue(Number(value)); return text.length > 12 ? `${text.slice(0, 11)}…` : text; } : undefined } } }
        } });
      setReady(true);
    });
    return () => { disposed = true; chart?.destroy(); };
  }, [labels, series, kind, horizontal, stacked, unit, theme]);
  const hasValues = series.some((row) => row.values.some((value) => value !== null && value > 0));
  return <div className={`admin-chart${horizontal ? " admin-chart-horizontal" : ""}`} data-ready={ready}>
    <canvas ref={ref} role="img" aria-label={title} />
    {!hasValues && <span className="admin-chart-empty">집계 데이터가 없습니다.</span>}
  </div>;
}
