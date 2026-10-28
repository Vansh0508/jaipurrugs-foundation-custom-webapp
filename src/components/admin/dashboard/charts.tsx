"use client";

import { Area } from "@/components/charts/area";
import { AreaChart } from "@/components/charts/area-chart";
import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { BarXAxis } from "@/components/charts/bar-x-axis";
import { BarYAxis } from "@/components/charts/bar-y-axis";
import { Grid } from "@/components/charts/grid";
import { ChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import { formatInr, monthToDate } from "@/lib/visits/dashboard";

// Thin wrappers over the BKLit UI charts in src/components/charts. They take plain
// serialisable props from the server-rendered dashboard and own the chart layout.

const EMPTY_NOTE = "Nothing to show for this period yet.";

function EmptyState({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center rounded-xl bg-neutral-50 text-sm text-muted ${className ?? ""}`}>
      {EMPTY_NOTE}
    </div>
  );
}

/** Visitors (headcount) per month, as an area chart. */
export function MonthlyAreaChart({
  data,
  dataKey,
  label,
}: {
  data: { month: string; visitors: number }[];
  dataKey: "visitors";
  label: string;
}) {
  const points = data.map((d) => ({ date: monthToDate(d.month), [dataKey]: d.visitors }));
  if (points.every((p) => !p[dataKey])) return <EmptyState className="aspect-[2/1]" />;
  return (
    <AreaChart aspectRatio="2.4 / 1" data={points} margin={{ top: 16, right: 24, bottom: 32, left: 24 }} xDataKey="date">
      <Grid horizontal />
      <Area dataKey={dataKey} fill="var(--chart-1)" />
      <XAxis tickMode="data" />
      <ChartTooltip rows={(point) => [{ color: "var(--chart-1)", label, value: Number(point[dataKey] ?? 0) }]} />
    </AreaChart>
  );
}

/** Income charged vs paid to artisan families, grouped by month. */
export function IncomeBarChart({ data }: { data: { month: string; income: number; to_artisans: number }[] }) {
  if (data.every((d) => !d.income && !d.to_artisans)) return <EmptyState className="aspect-[2.4/1]" />;
  const points = data.map((d) => ({
    name: monthToDate(d.month).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
    income: d.income,
    toArtisans: d.to_artisans,
  }));
  return (
    <BarChart aspectRatio="2.4 / 1" data={points} margin={{ top: 16, right: 24, bottom: 32, left: 24 }} xDataKey="name">
      <Grid horizontal />
      <Bar dataKey="income" fill="var(--chart-1)" />
      <Bar dataKey="toArtisans" fill="var(--chart-2)" />
      <BarXAxis />
      <ChartTooltip
        rows={(point) => [
          { color: "var(--chart-1)", label: "Charged", value: formatInr(Number(point.income ?? 0)) },
          { color: "var(--chart-2)", label: "To artisan families", value: formatInr(Number(point.toArtisans ?? 0)) },
        ]}
      />
    </BarChart>
  );
}

/** A ranked list as horizontal bars. Labels must already be display text (functions can't cross the server boundary). */
export function RankedBarChart({
  data,
  color = "var(--chart-1)",
}: {
  data: { label: string; value: number }[];
  color?: string;
}) {
  if (data.length === 0 || data.every((d) => !d.value)) return <EmptyState className="h-40" />;
  const points = data.map((d) => ({ name: d.label, value: d.value }));
  return (
    // The container takes its height from this wrapper; the chart fills it.
    <div style={{ height: Math.max(120, points.length * 38 + 16) }}>
      <BarChart
        aspectRatio="auto"
        barGap={0.35}
        className="h-full"
        data={points}
        margin={{ top: 8, right: 16, bottom: 8, left: 136 }}
        orientation="horizontal"
        xDataKey="name"
      >
        <Bar dataKey="value" fill={color} />
        <BarYAxis />
        <ChartTooltip rows={(point) => [{ color, label: String(point.name), value: Number(point.value ?? 0) }]} />
      </BarChart>
    </div>
  );
}
