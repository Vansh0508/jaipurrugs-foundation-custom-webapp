import { z } from "zod";
import {
  BOOKING_CHANNELS,
  GUEST_STATUSES,
  PROGRAM_CATEGORIES,
  VISIT_STATUSES,
  VISITOR_CATEGORIES,
} from "./constants";

// Shared validation for the visit-operations module (villages, experiences,
// partners, and later visits). Forms hold everything as strings, so numeric and
// date fields accept "" (= not set) and are normalised here, once.

export const PARTNER_SECTORS = [
  { id: "private", label: "Private sector" },
  { id: "public", label: "Public sector" },
  { id: "civil_society", label: "Civil society" },
] as const;

export type PartnerSector = (typeof PARTNER_SECTORS)[number]["id"];

export function partnerSectorLabel(id: string) {
  return PARTNER_SECTORS.find((s) => s.id === id)?.label ?? id;
}

const blank = (v: unknown) => v === "" || v === undefined || v === null;

/** "" / null → null, otherwise a whole number within [min, max]. */
function optionalInt(min: number, max: number, message: string) {
  return z.preprocess(
    (v) => (blank(v) ? null : Number(v)),
    z.number(message).int(message).min(min, message).max(max, message).nullable(),
  );
}

/** "" / null → null, otherwise a YYYY-MM-DD date. */
const optionalDate = z.preprocess(
  (v) => (blank(v) ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.").nullable(),
);

const optionalText = (max: number) => z.string().trim().max(max, `Keep this under ${max} characters.`);

export const villageSchema = z.object({
  name: z.string().trim().min(1, "Village name is required.").max(80),
  region: optionalText(80),
  craftType: optionalText(80),
  partnerType: optionalText(80),
  totalHouseholds: optionalInt(0, 10_000_000, "Households must be a whole number."),
  artisanFamiliesEngaged: optionalInt(0, 10_000_000, "Artisan families must be a whole number."),
  womenParticipants: optionalInt(0, 10_000_000, "Women participants must be a whole number."),
  activeSince: optionalDate,
  notes: optionalText(1000),
});

export type VillageInput = z.input<typeof villageSchema>;

export const itineraryStepSchema = z.object({
  title: z.string().trim().min(1, "Every itinerary step needs a title.").max(120),
  minutes: optionalInt(1, 1440, "Step minutes must be a whole number of 1 or more."),
  description: optionalText(500),
});

export type ItineraryStep = { title: string; minutes: number | null; description: string };

export const experienceSchema = z.object({
  name: z.string().trim().min(1, "Experience name is required.").max(120),
  description: optionalText(2000),
  category: optionalText(80),
  durationMin: optionalInt(1, 1440, "Duration must be a whole number of minutes."),
  capacity: optionalInt(1, 100_000, "Capacity must be a whole number."),
  seasonal: optionalText(160),
  featured: z.boolean(),
  itinerary: z.array(itineraryStepSchema).max(30, "An itinerary can have up to 30 steps."),
});

export type ExperienceInput = z.input<typeof experienceSchema>;

export const partnerSchema = z.object({
  name: z.string().trim().min(1, "Partner name is required.").max(120),
  sector: z.enum(["private", "public", "civil_society"], "Pick a sector."),
  partnerType: optionalText(80),
  notes: optionalText(1000),
});

export type PartnerInput = z.input<typeof partnerSchema>;

export function blankToNull(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Parses the JSONB `experiences.itinerary` column defensively for display. */
export function parseItinerary(raw: unknown): ItineraryStep[] {
  if (!Array.isArray(raw)) return [];
  const steps: ItineraryStep[] = [];
  for (const item of raw) {
    const parsed = itineraryStepSchema.safeParse(item);
    if (parsed.success) steps.push(parsed.data as ItineraryStep);
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

const ids = <T extends readonly { id: string }[]>(list: T) =>
  list.map((item) => item.id) as [T[number]["id"], ...T[number]["id"][]];

const optionalTime = z.preprocess(
  (v) => (blank(v) ? null : v),
  z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use a valid time.").nullable(),
);

const optionalMoney = z.preprocess(
  (v) => (blank(v) ? null : Number(v)),
  z
    .number("Amounts must be numbers.")
    .min(0, "Amounts can't be negative.")
    .max(1_000_000_000, "That amount is too large.")
    .nullable(),
);

const optionalUuid = z.preprocess((v) => (blank(v) ? null : v), z.string().uuid().nullable());

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (blank(v) ? null : v), z.enum(values).nullable());

export const visitSchema = z
  .object({
    visitType: z.string().trim().min(1, "Visit type is required.").max(80),
    visitDate: z
      .string("Pick the visit date.")
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the visit date."),
    startTime: optionalTime,
    endTime: optionalTime,
    status: z.enum(ids(VISIT_STATUSES)),
    pocName: optionalText(80),
    pocPhone: optionalText(30),
    facilitator: optionalText(80),
    partnerId: optionalUuid,
    headcount: optionalInt(0, 100_000, "Headcount must be a whole number."),
    visitorGroup: optionalText(120),
    source: optionalText(120),
    originPlace: optionalText(120),
    programCategory: z.enum(ids(PROGRAM_CATEGORIES)),
    visitorCategory: optionalEnum(ids(VISITOR_CATEGORIES)),
    bookingChannel: optionalEnum(ids(BOOKING_CHANNELS)),
    amountCharged: optionalMoney,
    amountToArtisans: optionalMoney,
    notes: optionalText(2000),
    feedbackFormId: optionalUuid,
    villageIds: z.array(z.string().uuid()).max(50),
    experienceIds: z.array(z.string().uuid()).max(200),
  })
  .superRefine((visit, ctx) => {
    if (visit.programCategory === "rural_experience") {
      if (!visit.visitorCategory) {
        ctx.addIssue({ code: "custom", message: "Pick the visitor category for a Rural Experience visit.", path: ["visitorCategory"] });
      }
      if (!visit.bookingChannel) {
        ctx.addIssue({ code: "custom", message: "Pick the booking channel for a Rural Experience visit.", path: ["bookingChannel"] });
      }
    }
  });

export type VisitInput = z.input<typeof visitSchema>;

export const guestSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  phone: z.string().trim().min(1, "Phone number is required.").max(30),
});

export const guestStatusSchema = z.enum(ids(GUEST_STATUSES));
