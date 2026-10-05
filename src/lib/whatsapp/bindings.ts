import { z } from "zod";
import {
  isLeadFieldRef,
  isVisitFieldRef,
  leadFieldLabel,
  readLeadField,
  type Lead,
  type LeadAttribute,
  type LeadFieldRef,
} from "@/lib/leads/fields";
import type { TemplateSummary } from "@/lib/whatsapp/templates";
import { readVisitField, type VisitContext } from "@/lib/whatsapp/visit-fields";

/**
 * Where one template variable's value comes from. Meta/Zernio only know
 * placeholders; this mapping lives in whatsapp_template_bindings.variables.
 */
export interface TemplateVariableBinding {
  /** TemplateVariable.key, e.g. "body:1". */
  key: string;
  field: LeadFieldRef;
  /** Sent when the lead has no value for the field. null = must be collected first. */
  fallback: string | null;
}

export const bindingSchema = z.object({
  key: z.string().regex(/^(header|body|button\.\d+):[a-z0-9_]+$/),
  field: z.string().refine(isLeadFieldRef, "Unknown lead field."),
  fallback: z
    .string()
    .trim()
    .max(200)
    .nullable()
    .transform((v) => (v ? v : null)),
});

export function parseBindings(raw: unknown): TemplateVariableBinding[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = bindingSchema.safeParse(item);
    return parsed.success ? [parsed.data as TemplateVariableBinding] : [];
  });
}

/**
 * True when a variable is filled from the visit. Such a template can only be sent by the visit
 * scheduler (which knows the visit), so the agent must never send it on its own.
 */
export function bindingsUseVisitFields(bindings: TemplateVariableBinding[]): boolean {
  return bindings.some((b) => isVisitFieldRef(b.field));
}

export interface BindingStatus {
  ready: boolean;
  unbound: string[];
  /** Bindings pointing at an attribute that no longer exists or was deactivated. */
  inactive: string[];
}

export function bindingStatus(
  summary: TemplateSummary,
  bindings: TemplateVariableBinding[],
  attributes: Pick<LeadAttribute, "key" | "is_active">[],
): BindingStatus {
  const activeKeys = new Set(attributes.filter((a) => a.is_active).map((a) => a.key));
  const unbound: string[] = [];
  const inactive: string[] = [];
  for (const variable of summary.variables) {
    const binding = bindings.find((b) => b.key === variable.key);
    if (!binding) unbound.push(variable.key);
    else if (binding.field.startsWith("attr:") && !activeKeys.has(binding.field.slice(5))) {
      inactive.push(variable.key);
    }
  }
  return { ready: unbound.length === 0 && inactive.length === 0, unbound, inactive };
}

export interface MissingValue {
  key: string;
  field: LeadFieldRef;
  label: string;
  description: string | null;
}

export type ResolveResult =
  | { ok: true; params: string[] }
  | { ok: false; unbound: string[]; missing: MissingValue[] };

/**
 * Fill every variable from the lead, server-side. The model never supplies
 * these values: a variable is either answered by the lead's data, by the
 * binding's fallback, or reported as missing so the agent can ask for it.
 */
export function resolveTemplateParams(
  summary: TemplateSummary,
  bindings: TemplateVariableBinding[],
  lead: Pick<Lead, "name" | "phone" | "attributes"> | null,
  attributes: Pick<LeadAttribute, "key" | "label" | "description" | "is_active">[],
  /** Set by the visit scheduler. Without it, `visit:` variables count as missing. */
  visit?: VisitContext | null,
): ResolveResult {
  const activeKeys = new Set(attributes.filter((a) => a.is_active).map((a) => a.key));
  const params: string[] = [];
  const unbound: string[] = [];
  const missing: MissingValue[] = [];

  for (const variable of summary.variables) {
    const binding = bindings.find((b) => b.key === variable.key);
    if (!binding) {
      unbound.push(variable.key);
      continue;
    }
    const fromSource = isVisitFieldRef(binding.field)
      ? readVisitField(visit, binding.field)
      : readLeadField(lead, binding.field, activeKeys);
    const value = fromSource ?? binding.fallback;
    if (value === null) {
      if (!missing.some((m) => m.field === binding.field)) {
        const attr = attributes.find((a) => `attr:${a.key}` === binding.field);
        missing.push({
          key: variable.key,
          field: binding.field,
          label: leadFieldLabel(binding.field, attributes),
          description: attr?.description ?? null,
        });
      }
      continue;
    }
    params[variable.index] = value;
  }

  if (unbound.length > 0 || missing.length > 0) return { ok: false, unbound, missing };
  return { ok: true, params };
}
