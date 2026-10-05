import type { Tables } from "@/lib/types/supabase";

export type LeadAttribute = Tables<"lead_attributes">;
export type Lead = Tables<"leads">;
export type LeadList = Tables<"lead_lists">;

/**
 * Values that come from the VISIT a message is about (not from the lead). They only
 * resolve in messages sent by the visit scheduler, which knows the visit; the agent and
 * the inbox composer have no visit in hand, so a template that uses one is "scheduled only".
 */
export const VISIT_FIELDS = [
  { id: "visit_type", label: "Visit type" },
  { id: "visit_date", label: "Visit date" },
  { id: "start_time", label: "Start time" },
  { id: "end_time", label: "End time" },
  { id: "poc_name", label: "Coordinator name" },
  { id: "village_names", label: "Villages" },
  { id: "experience_names", label: "Experiences" },
  { id: "feedback_token", label: "Feedback link token (for a URL button)" },
] as const;

export type VisitFieldId = (typeof VISIT_FIELDS)[number]["id"];

/**
 * A reference to one value, as stored in template bindings:
 * "name", "phone", "attr:<lead_attributes.key>", or "visit:<VisitFieldId>".
 */
export type LeadFieldRef = "name" | "phone" | `attr:${string}` | `visit:${VisitFieldId}`;

export function isVisitFieldRef(value: string): value is `visit:${VisitFieldId}` {
  return value.startsWith("visit:") && VISIT_FIELDS.some((f) => f.id === value.slice(6));
}

export const ATTRIBUTE_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
export const RESERVED_ATTRIBUTE_KEYS = ["name", "phone"];

export const LEAD_ATTRIBUTE_TYPES = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "select", label: "Select (fixed options)" },
] as const;

export function isLeadFieldRef(value: string): value is LeadFieldRef {
  if (value === "name" || value === "phone") return true;
  if (isVisitFieldRef(value)) return true;
  return value.startsWith("attr:") && ATTRIBUTE_KEY_PATTERN.test(value.slice(5));
}

export function attributeKeyOf(ref: LeadFieldRef): string | null {
  return ref.startsWith("attr:") ? ref.slice(5) : null;
}

/** "Village" → "village", "Loom type (main)" → "loom_type_main". */
export function slugifyAttributeKey(label: string): string {
  const slug = label
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const withLetter = /^[a-z]/.test(slug) ? slug : `f_${slug}`;
  return RESERVED_ATTRIBUTE_KEYS.includes(withLetter) ? `${withLetter}_1` : withLetter;
}

export function leadFieldLabel(ref: LeadFieldRef, attributes: Pick<LeadAttribute, "key" | "label">[]): string {
  if (ref === "name") return "Name";
  if (ref === "phone") return "Phone";
  if (isVisitFieldRef(ref)) return `Visit: ${VISIT_FIELDS.find((f) => f.id === ref.slice(6))?.label ?? ref}`;
  const key = attributeKeyOf(ref);
  return attributes.find((a) => a.key === key)?.label ?? key ?? ref;
}

/** All fields a template variable can bind to: built-ins plus active attributes. */
export function leadFieldOptions(attributes: Pick<LeadAttribute, "key" | "label" | "is_active">[]) {
  return [
    { ref: "name" as LeadFieldRef, label: "Name" },
    { ref: "phone" as LeadFieldRef, label: "Phone" },
    ...attributes
      .filter((a) => a.is_active)
      .map((a) => ({ ref: `attr:${a.key}` as LeadFieldRef, label: a.label })),
    ...VISIT_FIELDS.map((f) => ({ ref: `visit:${f.id}` as LeadFieldRef, label: `Visit: ${f.label} (scheduled messages only)` })),
  ];
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * The display value of a lead field, or null when it's empty or points at a
 * deactivated attribute (deactivated data is kept, but never sent).
 */
export function readLeadField(
  lead: Pick<Lead, "name" | "phone" | "attributes"> | null,
  ref: LeadFieldRef,
  activeKeys: Set<string>,
): string | null {
  if (!lead) return null;
  if (isVisitFieldRef(ref)) return null; // not on the lead; see readVisitField
  if (ref === "name") return lead.name?.trim() || null;
  if (ref === "phone") return lead.phone?.trim() || null;
  const key = attributeKeyOf(ref);
  if (!key || !activeKeys.has(key)) return null;
  const value = asObject(lead.attributes)[key];
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function leadAttributeValues(lead: Pick<Lead, "attributes">): Record<string, unknown> {
  return asObject(lead.attributes);
}
