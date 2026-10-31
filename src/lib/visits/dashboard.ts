import { BOOKING_CHANNELS, PROGRAM_CATEGORIES, VISITOR_CATEGORIES } from "./constants";
import { shiftMonth, todayIST } from "./time";

// Shapes returned by public.dashboard_stats(p_from, p_to, ...filters) — see
// supabase/migrations/20261005130000_dashboard_stats.sql for what each number means and
// supabase/migrations/20261030100000_primary_guest_dashboard_filters.sql for the filters.

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

export type DashboardRangeId = (typeof DASHBOARD_RANGES)[number]["id"] | "custom";

export const DEFAULT_DASHBOARD_RANGE = "12m";

/** "all" counts every program; the default keeps the impact numbers to Rural Experience. */
export const ALL_PROGRAMS = "all";
export const DEFAULT_DASHBOARD_PROGRAM = "rural_experience";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// dashboard_stats() refuses anything longer than this.
const MAX_RANGE_DAYS = 366 * 6;

export type DashboardSearchParams = {
  range?: string;
  from?: string;
  to?: string;
  program?: string;
  category?: string;
  channel?: string;
  village?: string;
};

export type DashboardFilters = {
  rangeId: DashboardRangeId;
  rangeLabel: string;
  from: string;
  to: string;
  /** A program id, or ALL_PROGRAMS. */
  program: string;
  visitorCategory: string | null;
  bookingChannel: string | null;
  villageId: string | null;
};

function isValidDate(value: string | undefined): value is string {
  return Boolean(value && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

function daysApart(from: string, to: string) {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

const pick = (value: string | undefined, ids: readonly string[]) => (value && ids.includes(value) ? value : null);

/**
 * The dashboard's period and filters from the URL. A valid ?from=&to= pair is a custom
 * range; otherwise a preset (from the first day of the earliest month to today, IST).
 */
export function resolveDashboardFilters(params: DashboardSearchParams, today: string = todayIST()): DashboardFilters {
  let period: Pick<DashboardFilters, "rangeId" | "rangeLabel" | "from" | "to">;
  const { from, to } = params;
  if (isValidDate(from) && isValidDate(to) && from <= to && daysApart(from, to) <= MAX_RANGE_DAYS) {
    period = { rangeId: "custom", rangeLabel: "Custom range", from, to };
  } else {
    const range =
      DASHBOARD_RANGES.find((r) => r.id === params.range) ?? DASHBOARD_RANGES.find((r) => r.id === DEFAULT_DASHBOARD_RANGE)!;
    period = {
      rangeId: range.id,
      rangeLabel: range.label,
      from: `${shiftMonth(today.slice(0, 7), -(range.months - 1))}-01`,
      to: today,
    };
  }

  return {
    ...period,
    program: pick(params.program, [ALL_PROGRAMS, ...PROGRAM_CATEGORIES.map((p) => p.id)]) ?? DEFAULT_DASHBOARD_PROGRAM,
    visitorCategory: pick(params.category, VISITOR_CATEGORIES.map((c) => c.id)),
    bookingChannel: pick(params.channel, BOOKING_CHANNELS.map((c) => c.id)),
    villageId: params.village && UUID_PATTERN.test(params.village) ? params.village : null,
  };
}

/** The RPC arguments shared by dashboard_stats() and dashboard_feedback_stats(). */
export function dashboardRpcArgs(filters: DashboardFilters) {
  return {
    p_from: filters.from,
    p_to: filters.to,
    p_program: filters.program,
    ...(filters.visitorCategory ? { p_visitor_category: filters.visitorCategory } : {}),
    ...(filters.bookingChannel ? { p_booking_channel: filters.bookingChannel } : {}),
    ...(filters.villageId ? { p_village_id: filters.villageId } : {}),
  };
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export function formatInr(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : inr.format(value);
}

/** "2026-09" -> a Date at the start of that month (UTC-noon safe for any local timezone). */
export function monthToDate(month: string): Date {
  const [year, mon] = month.split("-").map(Number);
  return new Date(year, mon - 1, 1, 12);
}
