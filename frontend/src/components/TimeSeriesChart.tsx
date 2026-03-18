import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useMemo } from "react";
import type { DailyStat } from "../types";

function cssVar(name: string) {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
  },
  labelStyle: { color: 'var(--muted-foreground)' },
  itemStyle: { color: 'var(--foreground)' },
};

const axisTick = { fill: cssVar('--muted-foreground') };

/* ---------- Utilization Chart ---------- */

interface UtilizationChartProps {
  dailyStats: DailyStat[];
  targetPct: number;
}

export function UtilizationChart({ dailyStats, targetPct }: UtilizationChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={dailyStats}>
        <CartesianGrid stroke="currentColor" opacity={0.15} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={axisTick}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={axisTick}
        />
        <Tooltip {...tooltipStyle} />
        <ReferenceLine
          y={targetPct}
          stroke="#EAB308"
          strokeDasharray="6 3"
          label={{ value: `Target ${targetPct}%`, fill: "#EAB308", position: "right" }}
        />
        <Line
          type="monotone"
          dataKey="utilization_pct"
          stroke="#3B82F6"
          dot={false}
          name="Utilization %"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ---------- Daily Grabs Chart ---------- */

interface DailyGrabsChartProps {
  dailyStats: DailyStat[];
}

export function DailyGrabsChart({ dailyStats }: DailyGrabsChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={dailyStats}>
        <CartesianGrid stroke="currentColor" opacity={0.15} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={axisTick}
          interval="preserveStartEnd"
        />
        <YAxis tick={axisTick} />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="grabbed" fill="#3B82F6" name="Grabbed" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- GB Flow Chart ---------- */

interface GBFlowChartProps {
  dailyStats: DailyStat[];
}

export function GBFlowChart({ dailyStats }: GBFlowChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={dailyStats}>
        <CartesianGrid stroke="currentColor" opacity={0.15} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={axisTick}
          interval="preserveStartEnd"
        />
        <YAxis tick={axisTick} />
        <Tooltip {...tooltipStyle} />
        <Legend />
        <Line
          type="monotone"
          dataKey="grabbed_gb"
          stroke="#22C55E"
          dot={false}
          name="Grabbed GB"
        />
        <Line
          type="monotone"
          dataKey="expired_gb"
          stroke="#EF4444"
          dot={false}
          name="Expired GB"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ---------- Upload Chart ---------- */

interface UploadChartProps {
  dailyStats: DailyStat[];
}

export function UploadChart({ dailyStats }: UploadChartProps) {
  const data = useMemo(() => {
    let cumulative = 0;
    return dailyStats.map((d) => {
      cumulative += d.upload_gb;
      return {
        date: d.date,
        daily_upload_gb: d.upload_gb,
        cumulative_upload_gb: Math.round(cumulative * 10) / 10,
      };
    });
  }, [dailyStats]);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid stroke="currentColor" opacity={0.15} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tick={axisTick}
          interval="preserveStartEnd"
        />
        <YAxis yAxisId="left" tick={axisTick} />
        <YAxis yAxisId="right" orientation="right" tick={axisTick} />
        <Tooltip {...tooltipStyle} />
        <Legend />
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="cumulative_upload_gb"
          stroke="#A855F7"
          dot={false}
          name="Cumulative Upload (GB)"
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="daily_upload_gb"
          stroke="#818CF8"
          dot={false}
          name="Daily Upload (GB)"
          strokeDasharray="4 2"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
