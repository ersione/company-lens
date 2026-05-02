"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { SnapshotHistory } from "@/lib/company-queries";
import { formatNumber, formatSnapshotMonth } from "@/lib/format";

type ChartRow = {
  month: string;
  monthLabel: string;
  employeeCount: number | null;
  annualSalary: number | null;
  monthlySalary: number | null;
  newJoiners: number | null;
  departures: number | null;
};

export function CompanyCharts({ history }: { history: SnapshotHistory[] }) {
  const data = history.map((snapshot) => ({
    month: snapshot.snapshotMonth,
    monthLabel: snapshot.snapshotMonth.slice(2).replace("-", "."),
    employeeCount: snapshot.employeeCount,
    annualSalary:
      snapshot.estimatedAverageAnnualSalary === null ? null : Math.round(snapshot.estimatedAverageAnnualSalary / 10000),
    monthlySalary:
      snapshot.estimatedAverageMonthlySalary === null ? null : Math.round(snapshot.estimatedAverageMonthlySalary / 10000),
    newJoiners: snapshot.newJoiners,
    departures: snapshot.departures
  }));

  return (
    <div className="chart-grid">
      <MetricLineCard
        data={data}
        title="가입자수"
        dataKey="employeeCount"
        unit="명"
        stroke="#0f766e"
      />
      <MetricLineCard
        data={data}
        title="추정 평균 연봉"
        dataKey="annualSalary"
        unit="만원"
        stroke="#7c3aed"
      />
      <MetricLineCard
        data={data}
        title="추정 평균 월급"
        dataKey="monthlySalary"
        unit="만원"
        stroke="#2563eb"
      />
      <MovementCard data={data} />
    </div>
  );
}

function MetricLineCard({
  data,
  title,
  dataKey,
  unit,
  stroke
}: {
  data: ChartRow[];
  title: string;
  dataKey: keyof Pick<ChartRow, "employeeCount" | "annualSalary" | "monthlySalary">;
  unit: string;
  stroke: string;
}) {
  const latest = data.at(-1)?.[dataKey] ?? null;
  const previous = data.length > 1 ? data.at(-2)?.[dataKey] ?? null : null;

  return (
    <div className="chart-card">
      <ChartSummary title={title} value={formatValue(latest, unit)} delta={formatDelta(latest, previous, unit)} />
      <div className="chart-canvas">
        <MeasuredChartFrame>
          {(width) => (
            <LineChart width={width} height={260} data={data} margin={{ top: 16, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#e3e8f0" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => formatNumber(Number(value))} width={56} />
              <Tooltip content={<ChartTooltip unit={unit} />} />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={stroke}
                strokeWidth={3}
                dot={{ r: 3, strokeWidth: 2 }}
                activeDot={{ r: 6 }}
                connectNulls
                name={title}
              />
            </LineChart>
          )}
        </MeasuredChartFrame>
      </div>
    </div>
  );
}

function MovementCard({ data }: { data: ChartRow[] }) {
  const latest = data.at(-1);
  const net = latest ? (latest.newJoiners ?? 0) - (latest.departures ?? 0) : null;

  return (
    <div className="chart-card">
      <ChartSummary
        title="신규취득 / 상실"
        value={`${formatNumber(latest?.newJoiners)} / ${formatNumber(latest?.departures)}명`}
        delta={net === null ? undefined : `순증 ${formatNumber(net)}명`}
      />
      <div className="chart-canvas">
        <MeasuredChartFrame>
          {(width) => (
            <BarChart width={width} height={260} data={data} margin={{ top: 16, right: 18, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="#e3e8f0" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<ChartTooltip unit="명" />} />
              <Legend content={<MovementLegend />} />
              <Bar dataKey="newJoiners" name="신규취득" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="departures" name="상실" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </MeasuredChartFrame>
      </div>
    </div>
  );
}

function MovementLegend() {
  return (
    <div className="chart-legend">
      <span>
        <i className="joiners-swatch" />
        신규취득
      </span>
      <span>
        <i className="departures-swatch" />
        상실
      </span>
    </div>
  );
}

function MeasuredChartFrame({ children }: { children: (width: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const updateWidth = () => {
      setWidth(Math.max(260, Math.floor(element.getBoundingClientRect().width)));
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="chart-frame">
      {width > 0 ? children(width) : <div className="chart-placeholder" />}
    </div>
  );
}

function ChartSummary({ title, value, delta }: { title: string; value: string; delta?: string }) {
  return (
    <div className="chart-header">
      <span>{title}</span>
      <div>
        <strong>{value}</strong>
        {delta ? <small>{delta}</small> : null}
      </div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: any[]; label?: string; unit: string }) {
  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0]?.payload as ChartRow | undefined;

  return (
    <div className="chart-tooltip">
      <strong>{row ? formatSnapshotMonth(row.month) : label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey} style={{ color: item.color }}>
          {item.name}: {formatValue(item.value, unit)}
        </span>
      ))}
    </div>
  );
}

function formatValue(value: unknown, unit: string) {
  return typeof value === "number" ? `${formatNumber(value)}${unit}` : "산출 불가";
}

function formatDelta(current: number | null, previous: number | null, unit: string) {
  if (current === null || previous === null) {
    return undefined;
  }

  const delta = current - previous;
  if (delta === 0) {
    return "변동 없음";
  }

  return `${delta > 0 ? "+" : ""}${formatNumber(delta)}${unit}`;
}
