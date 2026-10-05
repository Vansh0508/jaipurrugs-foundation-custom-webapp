import { visitStatusLabel, guestStatusLabel } from "@/lib/visits/constants";
import { formatLongDate, formatTimeRange } from "@/lib/visits/time";

// Shared by the visit tools and the visit block in the agent's prompt, so the
// model always sees dates and times written the same way.

export interface VisitRowLike {
  visit_id: string;
  visit_type: string;
  visit_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  guest_status: string;
  poc_name: string | null;
  poc_phone: string | null;
  facilitator: string | null;
  village_names: string[];
  experience_names: string[];
}

export function whenText(date: string | null, start: string | null, end: string | null) {
  return `${date ? formatLongDate(date) : "Date to be confirmed"}, ${formatTimeRange(start, end)}${
    start || end ? " IST" : ""
  }`;
}

/** One visit as a compact, model-friendly record. */
export function describeVisitRow(row: VisitRowLike, clean: (text: string) => string = (t) => t) {
  return {
    visitId: row.visit_id,
    visit: clean(row.visit_type),
    when: whenText(row.visit_date, row.start_time, row.end_time),
    visitStatus: visitStatusLabel(row.status),
    yourStatus: guestStatusLabel(row.guest_status),
    coordinator: row.poc_name ? clean(row.poc_name) : null,
    coordinatorPhone: row.poc_phone ?? null,
    host: row.facilitator ? clean(row.facilitator) : null,
    villages: row.village_names.map(clean),
    experiences: row.experience_names.map(clean),
  };
}

/** A single line for the system prompt. */
export function visitSummaryLine(row: VisitRowLike, clean: (text: string) => string) {
  const d = describeVisitRow(row, clean);
  const where = d.villages.length ? ` at ${d.villages.join(", ")}` : "";
  const who = d.coordinator ? `, coordinator ${d.coordinator}` : "";
  return `${d.visit} — ${d.when}${where} (${d.visitStatus}${who})`;
}
