import { shiftMonth, todayIST } from "./time";

// Shapes returned by public.dashboard_stats(p_from, p_to) — see
// supabase/migrations/20261005130000_dashboard_stats.sql for what each number means.

export type LabelValue = { label: string; value: number };

export interface DashboardStats {
  operations: {
    upcoming_visits: number;
    upcoming_guests: number;
    awaiting_completion: number;
    completed_in_range: number;
    cancelled_in_range: number;
  };
  reach: {
    visits: number;
    visitors: number;
    unique_guests: number;
    first_time_guests: number;
    repeat_guests: number;
    repeat_rate_pct: number | null;
    by_category: LabelValue[];
    by_channel: LabelValue[];
    by_village: LabelValue[];
    monthly: { month: string; visits: number; visitors: number }[];
  };
  economic: {
    total_income: number;
    income_to_artisans: number;
    pct_to_artisans: number | null;
    income_per_family: number | null;
    monthly: { month: string; income: number; to_artisans: number }[];
  };
  participation: {
    families_engaged: number;
    total_households: number;
    pct_households: number | null;
    women_participants: number;
    active_villages: number;
  };
  quality: {
    repeat_rate_pct: number | null;
    partners_used: number;
    partners_retained: number;
    partner_retention_pct: number | null;
    /** Average rating (rescaled to 0-5) from completed guest feedback; null until feedback exists. */
    avg_rating: number | null;
    feedback_count: number;
  };
  collaboration: {
    sectors_engaged: number;
    total_partners: number;
    by_sector: LabelValue[];
  };
  innovation: {
    craft_types: number;
    regions: number;
    partner_types: number;
    timeline: {
      village: string;
      active_since: string;
      craft: string | null;
      region: string | null;
      partner_type: string | null;
      cumulative: number;
    }[];
  };
}

/**
 * Validates the shape of public.dashboard_stats() and folds in the satisfaction numbers from
 * public.dashboard_feedback_stats() (a separate RPC; a missing or failed one just means "no ratings yet").
 */
export function parseDashboardStats(raw: unknown, feedback?: unknown): DashboardStats | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  for (const key of ["operations", "reach", "economic", "participation", "quality", "collaboration", "innovation"]) {
    if (typeof r[key] !== "object" || r[key] === null) return null;
  }
  const f = typeof feedback === "object" && feedback !== null ? (feedback as Record<string, unknown>) : {};
  const stats = raw as Omit<DashboardStats, "quality"> & { quality: Omit<DashboardStats["quality"], "avg_rating" | "feedback_count"> };
  return {
    ...stats,
    quality: {
      ...stats.quality,
      avg_rating: typeof f.avg_rating === "number" ? f.avg_rating : null,
      feedback_count: typeof f.feedback_count === "number" ? f.feedback_count : 0,
    },
  };
}

export const DASHBOARD_RANGES = [
  { id: "3m", label: "Last 3 months", months: 3 },
  { id: "6m", label: "Last 6 months", months: 6 },
  { id: "12m", label: "Last 12 months", months: 12 },
  { id: "24m", label: "Last 24 months", months: 24 },
] as const;

export type DashboardRangeId = (typeof DASHBOARD_RANGES)[number]["id"];

export const DEFAULT_DASHBOARD_RANGE: DashboardRangeId = "12m";

/** The inclusive date window for a range id: from the first day of the earliest month to today (IST). */
export function resolveDashboardRange(id: string | undefined | null, today: string = todayIST()) {
  const range = DASHBOARD_RANGES.find((r) => r.id === id) ?? DASHBOARD_RANGES.find((r) => r.id === DEFAULT_DASHBOARD_RANGE)!;
  const currentMonth = today.slice(0, 7);
  return {
    id: range.id,
    label: range.label,
    from: `${shiftMonth(currentMonth, -(range.months - 1))}-01`,
    to: today,
  };
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatInr(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : inr.format(value);
}

export function formatPct(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${value}%`;
}

/** Month-over-month change of the last two months in a series, or null when it can't be computed. */
export function monthOverMonthPct(values: number[]): number | null {
  if (values.length < 2) return null;
  const previous = values[values.length - 2];
  const latest = values[values.length - 1];
  if (!previous) return null;
  return Math.round(((latest - previous) / previous) * 1000) / 10;
}

/** "2026-09" -> a Date at the start of that month (UTC-noon safe for any local timezone). */
export function monthToDate(month: string): Date {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon - 1, 1, 12);
}
