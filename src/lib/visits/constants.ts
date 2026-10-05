// Fixed value sets for visits. The ids are what the database stores (see the
// check constraints in supabase/migrations/20261005110000_visits_core.sql).

export const VISIT_STATUSES = [
  { id: "tentative", label: "Tentative", color: "warning" },
  { id: "confirmed", label: "Confirmed", color: "accent" },
  { id: "booking_done", label: "Booking done", color: "accent" },
  { id: "completed", label: "Completed", color: "success" },
  { id: "cancelled", label: "Cancelled", color: "danger" },
] as const;

export type VisitStatus = (typeof VISIT_STATUSES)[number]["id"];
export type VisitStatusColor = (typeof VISIT_STATUSES)[number]["color"];

export const PROGRAM_CATEGORIES = [
  { id: "rural_experience", label: "Rural Experience" },
  { id: "other", label: "Other" },
] as const;

export const VISITOR_CATEGORIES = [
  { id: "individual", label: "Individual" },
  { id: "group", label: "Group" },
  { id: "corporate", label: "Corporate" },
  { id: "student", label: "Student" },
  { id: "tour_agency", label: "Tour agency" },
] as const;

export const BOOKING_CHANNELS = [
  { id: "airbnb", label: "Airbnb" },
  { id: "tripadvisor", label: "TripAdvisor" },
  { id: "viator", label: "Viator" },
  { id: "direct", label: "Direct" },
  { id: "partner_agency", label: "Partner agency" },
] as const;

export const GUEST_STATUSES = [
  { id: "invited", label: "Invited" },
  { id: "attended", label: "Attended" },
  { id: "no_show", label: "No-show" },
] as const;

export type GuestStatus = (typeof GUEST_STATUSES)[number]["id"];

/** Suggestions only — visit type is free text. */
export const SUGGESTED_VISIT_TYPES = [
  "Rural Experience",
  "Field Visit",
  "Industrial Visit",
  "Corporate Visit",
  "Student Visit",
  "Client Visit",
  "Media Visit",
  "VIP Visit",
];

function labelOf(list: readonly { id: string; label: string }[], id: string | null | undefined) {
  return list.find((item) => item.id === id)?.label ?? id ?? "";
}

export const visitStatusLabel = (id: string) => labelOf(VISIT_STATUSES, id);
export const visitorCategoryLabel = (id: string | null) => labelOf(VISITOR_CATEGORIES, id);
export const bookingChannelLabel = (id: string | null) => labelOf(BOOKING_CHANNELS, id);
export const guestStatusLabel = (id: string) => labelOf(GUEST_STATUSES, id);

export function visitStatusColor(id: string): VisitStatusColor {
  return VISIT_STATUSES.find((s) => s.id === id)?.color ?? "warning";
}
