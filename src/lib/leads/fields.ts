import type { Tables } from "@/lib/types/supabase";

export type LeadAttribute = Tables<"lead_attributes">;
export type Lead = Tables<"leads">;
export type LeadList = Tables<"lead_lists">;

/**
 * A reference to one value on a lead, as stored in template bindings:
 * "name", "phone", or "attr:<lead_attributes.key>".
 */
export type LeadFieldRef = "name" | "phone" | `attr:${string}`;

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
