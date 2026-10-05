import type { ReactNode } from "react";
import Link from "next/link";
import { bookingChannelLabel, visitorCategoryLabel } from "@/lib/visits/constants";
import {
  DASHBOARD_RANGES,
  formatInr,
  formatPct,
  monthOverMonthPct,
  type DashboardRangeId,
  type DashboardStats,
  type LabelValue,
} from "@/lib/visits/dashboard";
import { formatDate } from "@/lib/visits/time";
import { StatCard } from "../visits/stat-card";
import { IncomeBarChart, MonthlyAreaChart, PercentRings, RankedBarChart } from "./charts";

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

const cards = "grid grid-cols-2 gap-4 lg:grid-cols-4";

const SECTOR_SHORT_LABEL: Record<string, string> = { private: "Private", public: "Public", civil_society: "Civil society" };

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
  const { operations, reach, economic, participation, quality, collaboration, innovation } = stats;
  // The current month is still in progress, so growth compares the last two COMPLETE months.
  const completeMonths = economic.monthly.filter((m) => m.month < to.slice(0, 7));
  const growth = monthOverMonthPct(completeMonths.map((m) => m.income));
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
        <div className={cards}>
          <StatCard label="Upcoming visits" value={operations.upcoming_visits} hint={`${operations.upcoming_guests} guests`} />
          <StatCard
            label="Awaiting completion"
            value={operations.awaiting_completion}
            hint={operations.awaiting_completion > 0 ? "ended, not marked complete" : "all caught up"}
          />
          <StatCard label="Completed" value={operations.completed_in_range} hint="in period" />
          <StatCard label="Cancelled" value={operations.cancelled_in_range} hint="in period" />
        </div>
      </Section>

      <Section title="Reach">
        <div className={cards}>
          <StatCard label="Visitors" value={reach.visitors} hint={`${reach.visits} visits`} />
          <StatCard label="Unique guests" value={reach.unique_guests} hint="with a recorded contact" />
          <StatCard label="Repeat guests" value={reach.repeat_guests} hint={`${reach.first_time_guests} first-time`} />
          <StatCard label="Repeat rate" value={formatPct(reach.repeat_rate_pct)} />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard className="lg:col-span-3" hint="headcount per month" title="Visitors per month">
            <MonthlyAreaChart data={reach.monthly} dataKey="visitors" label="Visitors" />
          </ChartCard>
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

      <Section title="Economic value">
        <div className={cards}>
          <StatCard label="Total income" value={formatInr(economic.total_income)} />
          <StatCard
            label="To artisan families"
            value={formatInr(economic.income_to_artisans)}
            hint={economic.pct_to_artisans === null ? undefined : `${economic.pct_to_artisans}% of income`}
          />
          <StatCard label="Income per family" value={formatInr(economic.income_per_family)} hint="to artisans ÷ families" />
          <StatCard
            label="Month over month"
            value={growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth}%`}
            hint="last 2 complete months"
          />
        </div>
        <ChartCard hint="charged vs paid to artisan families" title="Income by month">
          <IncomeBarChart data={economic.monthly} />
        </ChartCard>
      </Section>

      <Section title="Participation & quality" description="Villages and partners as they are today, plus guest loyalty.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4 lg:col-span-2">
            <StatCard
              label="Artisan families"
              value={participation.families_engaged}
              hint={`of ${participation.total_households} households · ${participation.active_villages} village${participation.active_villages === 1 ? "" : "s"}`}
            />
            <StatCard label="Women participants" value={participation.women_participants} />
            <StatCard
              label="Satisfaction"
              value={quality.avg_rating === null ? "—" : `${quality.avg_rating} / 5`}
              hint={
                quality.feedback_count === 0
                  ? "no guest feedback yet"
                  : `${quality.feedback_count} response${quality.feedback_count === 1 ? "" : "s"}`
              }
            />
            <StatCard
              label="Partner retention"
              value={formatPct(quality.partner_retention_pct)}
              hint={`${quality.partners_retained} of ${quality.partners_used} partners rebooked`}
            />
          </div>
          <ChartCard hint="% of 100" title="Impact at a glance">
            <PercentRings
              rings={[
                { label: "Household participation", value: participation.pct_households, color: "var(--chart-1)" },
                { label: "Income to artisans", value: economic.pct_to_artisans, color: "var(--chart-2)" },
                { label: "Repeat guests", value: quality.repeat_rate_pct, color: "var(--chart-4)" },
              ]}
            />
          </ChartCard>
        </div>
      </Section>

      <Section
        title="Collaboration"
        description="Which sectors are engaged matters more than the partner count: private, public and civil society."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <StatCard label="Sectors engaged" value={`${collaboration.sectors_engaged} / 3`} hint="private · public · civil society" />
            <StatCard label="Active partners" value={collaboration.total_partners} />
          </div>
          <ChartCard className="lg:col-span-2" title="Partners by sector">
            <RankedBarChart color="var(--chart-5)" data={relabel(collaboration.by_sector, (id) => SECTOR_SHORT_LABEL[id] ?? id)} />
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
