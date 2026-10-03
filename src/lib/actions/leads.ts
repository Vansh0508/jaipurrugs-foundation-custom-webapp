"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveTeamMember } from "@/lib/auth/session";
import {
  ATTRIBUTE_KEY_PATTERN,
  RESERVED_ATTRIBUTE_KEYS,
  type LeadAttribute,
} from "@/lib/leads/fields";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/types/supabase";

export type LeadActionResult = { error?: string };

function revalidateLeads() {
  revalidatePath("/leads");
}

// ---------------------------------------------------------------------------
// Custom attributes
// ---------------------------------------------------------------------------

const optionsSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(50)
  .transform((opts) => [...new Set(opts)]);

const attributeSchema = z
  .object({
    key: z
      .string()
      .regex(ATTRIBUTE_KEY_PATTERN, "Key: lowercase letters, numbers and _, starting with a letter.")
      .refine((k) => !RESERVED_ATTRIBUTE_KEYS.includes(k), "name and phone are built-in fields."),
    label: z.string().trim().min(1, "Label is required.").max(60),
    type: z.enum(["text", "number", "date", "select"]),
    options: optionsSchema,
    description: z.string().trim().max(300),
  })
  .refine((a) => a.type !== "select" || a.options.length > 0, "A select attribute needs at least one option.");

export async function createLeadAttribute(input: z.input<typeof attributeSchema>): Promise<LeadActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = attributeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid attribute." };

  const { description, ...rest } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("lead_attributes").insert({
    ...rest,
    options: rest.type === "select" ? rest.options : [],
    description: description || null,
    created_by: email,
  });
  if (error) {
    return { error: error.code === "23505" ? "An attribute with that key already exists." : "Could not create the attribute." };
  }
  revalidateLeads();
  return {};
}

// Key and type are fixed after creation: existing lead values, form mappings
// and template bindings all refer to them.
const attributeUpdateSchema = z.object({
  label: z.string().trim().min(1, "Label is required.").max(60),
  options: optionsSchema,
  description: z.string().trim().max(300),
});

export async function updateLeadAttribute(
  id: string,
  input: z.input<typeof attributeUpdateSchema>,
): Promise<LeadActionResult> {
  await requireActiveTeamMember();
  const parsed = attributeUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid attribute." };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("lead_attributes").select("type").eq("id", id).maybeSingle();
  if (!existing) return { error: "Attribute not found." };
  if (existing.type === "select" && parsed.data.options.length === 0) {
    return { error: "A select attribute needs at least one option." };
  }

  const { error } = await supabase
    .from("lead_attributes")
    .update({
      label: parsed.data.label,
      description: parsed.data.description || null,
      ...(existing.type === "select" ? { options: parsed.data.options } : {}),
    })
    .eq("id", id);
  if (error) return { error: "Could not update the attribute." };
  revalidateLeads();
  return {};
}

/** Deactivating hides the attribute everywhere but keeps every stored value. */
export async function setLeadAttributeActive(id: string, isActive: boolean): Promise<LeadActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("lead_attributes").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the attribute." };
  revalidateLeads();
  revalidatePath("/templates");
  return {};
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const listSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80),
  description: z.string().trim().max(300),
});

export async function createLeadList(input: z.input<typeof listSchema>): Promise<LeadActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid list." };

  const supabase = await createClient();
  const { error } = await supabase.from("lead_lists").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
    created_by: email,
  });
  if (error) return { error: error.code === "23505" ? "A list with that name already exists." : "Could not create the list." };
  revalidateLeads();
  return {};
}

export async function updateLeadList(id: string, input: z.input<typeof listSchema>): Promise<LeadActionResult> {
  await requireActiveTeamMember();
  const parsed = listSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid list." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_lists")
    .update({ name: parsed.data.name, description: parsed.data.description || null })
    .eq("id", id);
  if (error) return { error: error.code === "23505" ? "A list with that name already exists." : "Could not update the list." };
  revalidateLeads();
  return {};
}

/** Deletes the list and its memberships only — the leads themselves stay. */
export async function deleteLeadList(id: string): Promise<LeadActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("lead_lists").delete().eq("id", id);
  if (error) return { error: "Could not delete the list." };
  revalidateLeads();
  return {};
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

const leadUpdateSchema = z.object({
  name: z.string().trim().max(120),
  /** Raw text per attribute key; coerced to each attribute's type below. */
  attributes: z.record(z.string(), z.string().max(500)),
  listIds: z.array(z.string().uuid()).max(100),
});

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/** Coerce and save name + active attribute values; deactivated attributes keep their stored data. */
async function applyLeadDetails(
  supabase: ServerClient,
  id: string,
  name: string,
  rawAttributes: Record<string, string>,
): Promise<LeadActionResult & { rejected?: string[] }> {
  const [{ data: lead }, { data: attributes }] = await Promise.all([
    supabase.from("leads").select("attributes").eq("id", id).maybeSingle(),
    supabase.from("lead_attributes").select("*"),
  ]);
  if (!lead) return { error: "Lead not found." };

  const next: Record<string, Json> = {
    ...((lead.attributes ?? {}) as Record<string, Json>),
  };
  const rejected: string[] = [];

  for (const attr of (attributes ?? []) as LeadAttribute[]) {
    if (!attr.is_active || !(attr.key in rawAttributes)) continue;
    const raw = rawAttributes[attr.key].trim();
    if (!raw) {
      delete next[attr.key];
      continue;
    }
    const { data: coerced } = await supabase.rpc("lead_attribute_value", {
      p_type: attr.type,
      p_options: attr.options,
      p_raw: raw,
    });
    if (coerced === null || coerced === undefined) rejected.push(attr.label);
    else next[attr.key] = coerced;
  }

  if (rejected.length > 0) {
    return { error: `Invalid value for: ${rejected.join(", ")}.`, rejected };
  }

  const { error } = await supabase
    .from("leads")
    .update({ name: name || null, attributes: next })
    .eq("id", id);
  return error ? { error: "Could not save the lead." } : {};
}

export async function updateLead(
  id: string,
  input: z.input<typeof leadUpdateSchema>,
): Promise<LeadActionResult & { rejected?: string[] }> {
  await requireActiveTeamMember();
  const parsed = leadUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid lead details." };

  const supabase = await createClient();
  const saved = await applyLeadDetails(supabase, id, parsed.data.name, parsed.data.attributes);
  if (saved.error) return saved;

  const { data: current } = await supabase.from("lead_list_members").select("list_id").eq("lead_id", id);
  const currentIds = new Set((current ?? []).map((m) => m.list_id));
  const wanted = new Set(parsed.data.listIds);
  const toAdd = [...wanted].filter((listId) => !currentIds.has(listId));
  const toRemove = [...currentIds].filter((listId) => !wanted.has(listId));

  if (toAdd.length > 0) {
    await supabase.from("lead_list_members").insert(toAdd.map((list_id) => ({ list_id, lead_id: id })));
  }
  if (toRemove.length > 0) {
    await supabase.from("lead_list_members").delete().eq("lead_id", id).in("list_id", toRemove);
  }

  revalidateLeads();
  return {};
}

/** Name + attributes only (the inbox profile panel); list membership is left as is. */
export async function updateLeadDetails(
  id: string,
  input: { name: string; attributes: Record<string, string> },
): Promise<LeadActionResult & { rejected?: string[] }> {
  await requireActiveTeamMember();
  const parsed = leadUpdateSchema.omit({ listIds: true }).safeParse(input);
  if (!parsed.success) return { error: "Invalid lead details." };

  const supabase = await createClient();
  const saved = await applyLeadDetails(supabase, id, parsed.data.name, parsed.data.attributes);
  if (!saved.error) revalidateLeads();
  return saved;
}

export async function deleteLead(id: string): Promise<LeadActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return { error: "Could not delete the lead." };
  revalidateLeads();
  return {};
}

// ---------------------------------------------------------------------------
// Form → lead mapping
// ---------------------------------------------------------------------------

const mappingSchema = z.object({
  enabled: z.boolean(),
  phoneFieldId: z.string().uuid().nullable(),
  nameFieldId: z.string().uuid().nullable(),
  attributeMap: z.record(z.string().uuid(), z.string().regex(ATTRIBUTE_KEY_PATTERN)),
  listIds: z.array(z.string().uuid()).max(50),
});

export async function saveFormLeadMapping(
  formId: string,
  input: z.input<typeof mappingSchema>,
): Promise<LeadActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = mappingSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid mapping." };
  if (parsed.data.enabled && !parsed.data.phoneFieldId) {
    return { error: "Choose the phone field — it's how submissions are matched to leads." };
  }

  const supabase = await createClient();
  const { data: fields } = await supabase
    .from("form_fields")
    .select("id, type")
    .eq("form_id", formId)
    .is("deleted_at", null);
  const fieldIds = new Set((fields ?? []).map((f) => f.id));
  const referenced = [
    parsed.data.phoneFieldId,
    parsed.data.nameFieldId,
    ...Object.keys(parsed.data.attributeMap),
  ].filter((id): id is string => Boolean(id));
  if (referenced.some((id) => !fieldIds.has(id))) return { error: "A mapped field doesn't belong to this form." };

  const { error } = await supabase.from("form_lead_mappings").upsert({
    form_id: formId,
    enabled: parsed.data.enabled,
    phone_field_id: parsed.data.phoneFieldId,
    name_field_id: parsed.data.nameFieldId,
    attribute_map: parsed.data.attributeMap,
    list_ids: parsed.data.listIds,
    updated_by: email,
  });
  if (error) return { error: "Could not save the mapping." };

  revalidatePath(`/forms/${formId}/leads`);
  return {};
}

/** Backfill: fills gaps on leads from this form's existing completed submissions. */
export async function syncFormLeads(formId: string): Promise<LeadActionResult & { synced?: number }> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sync_form_leads", { p_form_id: formId });
  if (error) return { error: "Sync failed." };
  revalidateLeads();
  return { synced: data ?? 0 };
}
