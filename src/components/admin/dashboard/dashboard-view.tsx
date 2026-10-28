import type { ReactNode } from "react";
import Link from "next/link";
import { bookingChannelLabel, visitorCategoryLabel } from "@/lib/visits/constants";
import {
  DASHBOARD_RANGES,
  formatInr,
  type DashboardRangeId,
  type DashboardStats,
  type LabelValue,
} from "@/lib/visits/dashboard";
import { formatDate } from "@/lib/visits/time";
import { StatCard } from "../visits/stat-card";
import { IncomeBarChart, MonthlyAreaChart, RankedBarChart } from "./charts";

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{title}</h2>
        {description ? <p className="text-xs text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function ChartCard({
  title,
  hint,
  className = "",
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-2xs ${className}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}


/** Turns stored ids into display labels on the server, before the data reaches a client chart. */
function relabel(items: LabelValue[], labelFor: (id: string) => string): LabelValue[] {
  return items.map((item) => ({ ...item, label: labelFor(item.label) }));
}

export function DashboardView({
  stats,
  rangeId,
  rangeLabel,
  from,
  to,
}: {
  stats: DashboardStats;
  rangeId: DashboardRangeId;
  rangeLabel: string;
  from: string;
  to: string;
}) {
  const { operations, reach, economic, innovation } = stats;
  const hasAnyData = reach.visits > 0 || operations.upcoming_visits > 0 || operations.completed_in_range > 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-muted">
            {rangeLabel}: {formatDate(from)} – {formatDate(to)}. Reach and income count completed Rural Experience
            visits only.
          </p>
        </div>
        <nav aria-label="Period" className="flex gap-1 rounded-xl bg-neutral-100 p-1">
          {DASHBOARD_RANGES.map((range) => (
            <Link
              key={range.id}
              aria-current={range.id === rangeId ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                range.id === rangeId ? "bg-white font-medium shadow-sm" : "text-muted hover:text-foreground"
              }`}
              href={`/dashboard?range=${range.id}`}
            >
              {range.id.replace("m", " mo")}
            </Link>
          ))}
        </nav>
      </div>

      {!hasAnyData ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted">
          No visits in this period yet. Add visits on <Link className="text-accent" href="/trips">Trips</Link> and mark
          them completed — reach, income and guest numbers appear here as soon as they are.
        </div>
      ) : null}

      <Section title="Operations" description="What needs attention now.">
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="Upcoming visits" value={operations.upcoming_visits} hint={`${operations.upcoming_guests} guests`} />
          <StatCard label="Completed" value={operations.completed_in_range} hint="in period" />
        </div>
      </Section>

      <Section title="Reach & economic value">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard label="Visitors" value={reach.visitors} hint={`${reach.visits} visits`} />
          <StatCard label="Total income" value={formatInr(economic.total_income)} />
          <StatCard
            label="To artisan families"
            value={formatInr(economic.income_to_artisans)}
            hint={economic.pct_to_artisans === null ? undefined : `${economic.pct_to_artisans}% of income`}
          />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard hint="charged vs paid to artisan families" title="Income by month">
            <IncomeBarChart data={economic.monthly} />
          </ChartCard>
          <ChartCard hint="headcount per month" title="Visitors per month">
            <MonthlyAreaChart data={reach.monthly} dataKey="visitors" label="Visitors" />
          </ChartCard>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard hint="completed visits" title="By booking channel">
            <RankedBarChart data={relabel(reach.by_channel, (id) => (id === "partner_agency" ? "Agency" : bookingChannelLabel(id)))} />
          </ChartCard>
          <ChartCard hint="completed visits" title="By visitor category">
            <RankedBarChart color="var(--chart-2)" data={relabel(reach.by_category, visitorCategoryLabel)} />
          </ChartCard>
          <ChartCard hint="completed visits" title="By village">
            <RankedBarChart color="var(--chart-4)" data={reach.by_village} />
          </ChartCard>
        </div>
      </Section>

      <Section
        title="Innovation"
        description="The model replicating into different crafts, regions and partner types is a stronger scaling claim than identical copies."
      >
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Craft types" value={innovation.craft_types} />
          <StatCard label="Regions" value={innovation.regions} />
          <StatCard label="Partner types" value={innovation.partner_types} />
        </div>
        <ChartCard title="Village growth over time">
          {innovation.timeline.length === 0 ? (
            <p className="text-sm text-muted">
              No villages with an &ldquo;active since&rdquo; date yet. Add one on the Villages page.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border/60">
              {innovation.timeline.map((entry) => (
                <li key={entry.village} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                  <span className="w-6 text-right tabular-nums text-muted">{entry.cumulative}</span>
                  <span className="min-w-32 font-medium">{entry.village}</span>
                  <span className="w-28 text-muted">{formatDate(entry.active_since)}</span>
                  <span className="text-muted">
                    {[entry.craft, entry.region, entry.partner_type].filter(Boolean).join(" · ") || "—"}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </ChartCard>
      </Section>
    </div>
  );
}
