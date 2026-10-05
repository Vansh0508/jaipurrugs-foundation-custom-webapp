// All visit dates and times are Asia/Kolkata wall-clock values. `visits.visit_date`
// is a plain date and `start_time`/`end_time` are plain times; the database derives
// the absolute `start_at`/`end_at` instants from them (see visits_before_write).

export const BUSINESS_TIMEZONE = "Asia/Kolkata";

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in IST as YYYY-MM-DD (the server's own timezone is irrelevant). */
export function todayIST(now: Date = new Date()): string {
  return dateKeyFormatter.format(now);
}

export function currentMonthIST(now: Date = new Date()): string {
  return todayIST(now).slice(0, 7);
}

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function parseMonth(value: string | undefined | null): string {
  return value && MONTH_PATTERN.test(value) ? value : currentMonthIST();
}

export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, mon - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function shortMonthLabel(month: string): string {
  const [year, mon] = month.split("-").map(Number);
  return new Date(Date.UTC(year, mon - 1, 1)).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * The days shown in a month grid (Sunday-first), as YYYY-MM-DD keys. Only as many
 * weeks as the month needs (4 to 6), so there is never an empty trailing row.
 */
export function monthGrid(month: string): { days: string[]; from: string; to: string } {
  const [year, mon] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, mon - 1, 1));
  const offset = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const days: string[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(Date.UTC(year, mon - 1, 1 - offset + i));
    days.push(d.toISOString().slice(0, 10));
  }
  return { days, from: days[0], to: days[days.length - 1] };
}

/** "2026-10-10" -> "10 Oct 2026". */
export function formatDate(date: string | null | undefined): string {
  if (!date) return "Date to be confirmed";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatLongDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "13:30:00" or "13:30" -> "1:30 PM". */
export function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatTimeRange(start: string | null | undefined, end: string | null | undefined): string {
  if (start && end) return `${formatTime(start)} – ${formatTime(end)}`;
  if (start) return `from ${formatTime(start)}`;
  if (end) return `until ${formatTime(end)}`;
  return "Time to be confirmed";
}

/** Postgres `time` ("13:30:00") -> the "HH:MM" an <input type="time"> expects. */
export function timeInputValue(time: string | null | undefined): string {
  return time ? time.slice(0, 5) : "";
}
