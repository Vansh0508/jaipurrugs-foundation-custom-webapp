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

/**
 * The program a visit belongs to. Its label is also stored as the visit's
 * `visit_type`, which is what message sequences are matched on.
 */
export const PROGRAM_CATEGORIES = [
  { id: "rural_experience", label: "Rural Experience" },
  { id: "industrial_visit", label: "Industrial Visit" },
  { id: "village_field_visit", label: "Village / Field Visit" },
] as const;

export type ProgramCategory = (typeof PROGRAM_CATEGORIES)[number]["id"];

export const VISITOR_CATEGORIES = [
  { id: "buyer", label: "Buyers" },
  { id: "partner", label: "Partners" },
  { id: "collaborator", label: "Collaborators" },
  { id: "student", label: "Students" },
  { id: "entrepreneur", label: "Entrepreneurs" },
  { id: "designer", label: "Designers" },
  { id: "architect", label: "Architects" },
  { id: "tourist", label: "Tourists" },
  { id: "corporate", label: "Corporate group" },
  { id: "individual", label: "Individual" },
  { id: "group", label: "Group" },
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

/** How a visit's details open on Trips; remembered per user in their auth metadata. */
export const VISIT_DETAIL_VIEWS = ["sidebar", "popup"] as const;
export type VisitDetailView = (typeof VISIT_DETAIL_VIEWS)[number];

/** Dialling codes offered next to the coordinator's phone number. */
export const COUNTRY_CODES = [
  { id: "+91", label: "India" },
  { id: "+1", label: "US / Canada" },
  { id: "+44", label: "UK" },
  { id: "+971", label: "UAE" },
  { id: "+61", label: "Australia" },
  { id: "+49", label: "Germany" },
  { id: "+33", label: "France" },
  { id: "+39", label: "Italy" },
  { id: "+34", label: "Spain" },
  { id: "+31", label: "Netherlands" },
  { id: "+41", label: "Switzerland" },
  { id: "+65", label: "Singapore" },
  { id: "+81", label: "Japan" },
  { id: "+977", label: "Nepal" },
  { id: "+94", label: "Sri Lanka" },
  { id: "+880", label: "Bangladesh" },
] as const;

export const DEFAULT_COUNTRY_CODE = "+91";

function labelOf(list: readonly { id: string; label: string }[], id: string | null | undefined) {
  return list.find((item) => item.id === id)?.label ?? id ?? "";
}

export const visitStatusLabel = (id: string) => labelOf(VISIT_STATUSES, id);
export const programLabel = (id: string) => labelOf(PROGRAM_CATEGORIES, id);
export const visitorCategoryLabel = (id: string | null) => labelOf(VISITOR_CATEGORIES, id);
export const bookingChannelLabel = (id: string | null) => labelOf(BOOKING_CHANNELS, id);
export const guestStatusLabel = (id: string) => labelOf(GUEST_STATUSES, id);

export function visitStatusColor(id: string): VisitStatusColor {
  return VISIT_STATUSES.find((s) => s.id === id)?.color ?? "warning";
}
