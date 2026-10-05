import { z } from "zod";

// Shared by the messaging server actions and the UI.

export const RULE_ANCHORS = [
  { id: "on_complete", label: "after the visit is marked completed" },
  { id: "before_start", label: "before the visit starts" },
  { id: "after_start", label: "after the visit starts" },
] as const;

export type RuleAnchor = (typeof RULE_ANCHORS)[number]["id"];

export const SEND_STATUSES = [
  { id: "queued", label: "Scheduled", color: "accent" },
  { id: "processing", label: "Sending", color: "accent" },
  { id: "sent", label: "Sent", color: "success" },
  { id: "dry_run", label: "Dry run", color: "default" },
  { id: "skipped", label: "Skipped", color: "warning" },
  { id: "cancelled", label: "Cancelled", color: "default" },
  { id: "failed", label: "Failed", color: "danger" },
  { id: "unknown", label: "Check needed", color: "danger" },
] as const;

export function sendStatusMeta(id: string) {
  return SEND_STATUSES.find((s) => s.id === id) ?? { id, label: id, color: "default" as const };
}

/** Statuses a person may put back in the queue. `unknown` may already have been delivered — the UI warns. */
export const RESENDABLE_STATUSES = ["failed", "unknown", "skipped", "dry_run", "cancelled"] as const;

const UNITS = { minutes: 1, hours: 60, days: 1440 } as const;
export type OffsetUnit = keyof typeof UNITS;

export function toMinutes(amount: number, unit: OffsetUnit) {
  return Math.round(amount * UNITS[unit]);
}

/** 180 -> { amount: 3, unit: "hours" } using the largest unit that divides evenly. */
export function fromMinutes(minutes: number): { amount: number; unit: OffsetUnit } {
  if (minutes > 0 && minutes % 1440 === 0) return { amount: minutes / 1440, unit: "days" };
  if (minutes > 0 && minutes % 60 === 0) return { amount: minutes / 60, unit: "hours" };
  return { amount: minutes, unit: "minutes" };
}

/** "3 hours after the visit is marked completed", "1 day before the visit starts". */
export function describeTiming(anchor: string, offsetMinutes: number) {
  const { amount, unit } = fromMinutes(offsetMinutes);
  const when = RULE_ANCHORS.find((a) => a.id === anchor)?.label ?? anchor;
  if (offsetMinutes === 0) {
    return anchor === "on_complete" ? "As soon as the visit is marked completed" : `At the start of the visit`;
  }
  return `${amount} ${amount === 1 ? unit.slice(0, -1) : unit} ${when}`;
}

const anchorIds = RULE_ANCHORS.map((a) => a.id) as [RuleAnchor, ...RuleAnchor[]];

export const ruleSchema = z.object({
  name: z.string().trim().min(1, "Give the message a name.").max(80),
  anchor: z.enum(anchorIds, "Pick when it is sent."),
  offsetMinutes: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? 0 : Number(v)),
    z.number("Enter a number for the delay.").int("Use a whole number.").min(0, "The delay can't be negative.").max(43200, "The delay can be at most 30 days."),
  ),
  templateName: z.string().trim().min(1, "Choose a template.").max(120),
  templateLanguage: z.string().trim().min(2, "Choose a template.").max(20),
  enabled: z.boolean(),
});

export type RuleInput = z.input<typeof ruleSchema>;

export const ruleSetSchema = z.object({
  name: z.string().trim().min(1, "Give the sequence a name.").max(80),
  description: z.string().trim().max(300),
  visitType: z.string().trim().max(80),
});

export type RuleSetInput = z.input<typeof ruleSetSchema>;

export const settingsSchema = z.object({
  sendsEnabled: z.boolean(),
  dryRun: z.boolean(),
  autoCompleteAfterHours: z.preprocess(
    (v) => Number(v),
    z.number("Enter the hours.").int().min(0, "Use 0 or more hours.").max(168, "At most 168 hours (7 days)."),
  ),
  quietStart: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use a valid time."),
  quietEnd: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use a valid time."),
  expiryDays: z.preprocess(
    (v) => Number(v),
    z.number("Enter the days.").int().min(1, "At least 1 day.").max(60, "At most 60 days."),
  ),
});

export type SettingsInput = z.input<typeof settingsSchema>;

export interface TemplateOption {
  name: string;
  language: string;
  bodyText: string;
  /** Every variable is bound to a lead or visit field, so the scheduler can fill it. */
  ready: boolean;
  usesVisitFields: boolean;
}
