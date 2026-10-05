"use server";

import { revalidatePath } from "next/cache";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  RESENDABLE_STATUSES,
  ruleSchema,
  ruleSetSchema,
  settingsSchema,
  type RuleInput,
  type RuleSetInput,
  type SettingsInput,
  type TemplateOption,
} from "@/lib/visits/messaging";
import { bindingStatus, bindingsUseVisitFields, parseBindings } from "@/lib/whatsapp/bindings";
import { summarizeTemplate } from "@/lib/whatsapp/templates";
import { getPrimaryWhatsAppAccount } from "@/lib/zernio/account";
import { listWhatsAppTemplates } from "@/lib/zernio/client";

export type MessagingResult = { error?: string };

function revalidateMessaging() {
  revalidatePath("/messaging");
  revalidatePath("/trips");
  revalidatePath("/calendar");
}

// ---------------------------------------------------------------------------
// Approved templates a rule can use
// ---------------------------------------------------------------------------

export async function listRuleTemplates(): Promise<{ templates: TemplateOption[]; error?: string }> {
  await requireActiveTeamMember();
  const { account, error } = await getPrimaryWhatsAppAccount();
  if (!account) return { templates: [], error: error ?? "No WhatsApp account is connected in Settings." };

  const supabase = await createClient();
  const [list, { data: bindingRows }, { data: attributes }] = await Promise.all([
    listWhatsAppTemplates(account.accountId, { status: "APPROVED" }),
    supabase.from("whatsapp_template_bindings").select("template_name, language, variables"),
    supabase.from("lead_attributes").select("key, is_active"),
  ]);
  if (!list.success) return { templates: [], error: list.error ?? "Could not load templates." };

  const templates = list.templates
    .filter((t) => t.status === "APPROVED")
    .map((t): TemplateOption => {
      const summary = summarizeTemplate(t);
      const bindings = parseBindings(
        (bindingRows ?? []).find((b) => b.template_name === t.name && b.language === t.language)?.variables,
      );
      return {
        name: summary.name,
        language: summary.language,
        bodyText: summary.bodyText,
        ready: bindingStatus(summary, bindings, attributes ?? []).ready,
        usesVisitFields: bindingsUseVisitFields(bindings),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { templates };
}

// ---------------------------------------------------------------------------
// Rule sets (reusable sequences)
// ---------------------------------------------------------------------------

export async function createRuleSet(input: RuleSetInput): Promise<MessagingResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = ruleSetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid sequence." };

  const supabase = await createClient();
  const { error } = await supabase.from("message_rule_sets").insert({
    name: parsed.data.name,
    description: parsed.data.description || null,
    visit_type: parsed.data.visitType || null,
    created_by: email,
  });
  if (error) return { error: error.code === "23505" ? "A sequence with that name already exists." : "Could not create the sequence." };
  revalidateMessaging();
  return {};
}

export async function updateRuleSet(id: string, input: RuleSetInput): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const parsed = ruleSetSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid sequence." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("message_rule_sets")
    .update({ name: parsed.data.name, description: parsed.data.description || null, visit_type: parsed.data.visitType || null })
    .eq("id", id);
  if (error) return { error: error.code === "23505" ? "A sequence with that name already exists." : "Could not update the sequence." };
  revalidateMessaging();
  return {};
}

export async function setRuleSetActive(id: string, isActive: boolean): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("message_rule_sets").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Could not update the sequence." };
  revalidateMessaging();
  return {};
}

export async function deleteRuleSet(id: string): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("message_rule_sets").delete().eq("id", id);
  if (error) return { error: "Could not delete the sequence." };
  revalidateMessaging();
  return {};
}

export async function createRuleSetItem(ruleSetId: string, input: RuleInput): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  const supabase = await createClient();
  const { error } = await supabase.from("message_rule_set_items").insert({
    rule_set_id: ruleSetId,
    name: parsed.data.name,
    anchor: parsed.data.anchor,
    offset_minutes: parsed.data.offsetMinutes,
    template_name: parsed.data.templateName,
    template_language: parsed.data.templateLanguage,
    enabled: parsed.data.enabled,
  });
  if (error) return { error: "Could not add the message." };
  revalidateMessaging();
  return {};
}

export async function updateRuleSetItem(id: string, input: RuleInput): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("message_rule_set_items")
    .update({
      name: parsed.data.name,
      anchor: parsed.data.anchor,
      offset_minutes: parsed.data.offsetMinutes,
      template_name: parsed.data.templateName,
      template_language: parsed.data.templateLanguage,
      enabled: parsed.data.enabled,
    })
    .eq("id", id);
  if (error) return { error: "Could not update the message." };
  revalidateMessaging();
  return {};
}

export async function deleteRuleSetItem(id: string): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("message_rule_set_items").delete().eq("id", id);
  if (error) return { error: "Could not delete the message." };
  revalidateMessaging();
  return {};
}

// ---------------------------------------------------------------------------
// Rules on one visit
// ---------------------------------------------------------------------------

/**
 * Copies a sequence's messages onto a visit. Messages already copied from the same item are
 * skipped, so applying twice never doubles anything. Later edits to the sequence don't change
 * what a visit already has scheduled.
 */
export async function applyRuleSetToVisit(visitId: string, ruleSetId: string): Promise<MessagingResult & { added?: number }> {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("message_rule_set_items")
    .select("*")
    .eq("rule_set_id", ruleSetId)
    .eq("enabled", true);
  if (!items || items.length === 0) return { error: "That sequence has no messages yet." };

  const { data: existing } = await supabase.from("visit_message_rules").select("source_item_id").eq("visit_id", visitId);
  const have = new Set((existing ?? []).map((r) => r.source_item_id).filter(Boolean));
  const fresh = items.filter((i) => !have.has(i.id));
  if (fresh.length === 0) return { added: 0 };

  const { error } = await supabase.from("visit_message_rules").insert(
    fresh.map((i) => ({
      visit_id: visitId,
      name: i.name,
      anchor: i.anchor,
      offset_minutes: i.offset_minutes,
      template_name: i.template_name,
      template_language: i.template_language,
      enabled: true,
      source_item_id: i.id,
    })),
  );
  if (error) return { error: "Could not add the messages to the visit." };
  revalidateMessaging();
  return { added: fresh.length };
}

export async function createVisitRule(visitId: string, input: RuleInput): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  const supabase = await createClient();
  const { error } = await supabase.from("visit_message_rules").insert({
    visit_id: visitId,
    name: parsed.data.name,
    anchor: parsed.data.anchor,
    offset_minutes: parsed.data.offsetMinutes,
    template_name: parsed.data.templateName,
    template_language: parsed.data.templateLanguage,
    enabled: parsed.data.enabled,
  });
  if (error) return { error: "Could not add the message." };
  revalidateMessaging();
  return {};
}

export async function updateVisitRule(id: string, input: RuleInput): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid message." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("visit_message_rules")
    .update({
      name: parsed.data.name,
      anchor: parsed.data.anchor,
      offset_minutes: parsed.data.offsetMinutes,
      template_name: parsed.data.templateName,
      template_language: parsed.data.templateLanguage,
      enabled: parsed.data.enabled,
    })
    .eq("id", id);
  if (error) return { error: "Could not update the message." };
  revalidateMessaging();
  return {};
}

export async function deleteVisitRule(id: string): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("visit_message_rules").delete().eq("id", id);
  if (error) return { error: "Could not remove the message." };
  revalidateMessaging();
  return {};
}

export interface VisitMessagingRule {
  id: string;
  name: string;
  anchor: string;
  offsetMinutes: number;
  templateName: string;
  templateLanguage: string;
  enabled: boolean;
}

export interface VisitMessagingSend {
  id: string;
  ruleId: string;
  ruleName: string;
  guestName: string | null;
  status: string;
  runAt: string;
  sentAt: string | null;
  lastError: string | null;
  attempts: number;
}

export async function getVisitMessaging(visitId: string): Promise<{
  rules: VisitMessagingRule[];
  sends: VisitMessagingSend[];
  sequences: { id: string; name: string; itemCount: number }[];
  settings: { sendsEnabled: boolean; dryRun: boolean };
}> {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const [{ data: rules }, { data: sends }, { data: sequences }, { data: settings }] = await Promise.all([
    supabase.from("visit_message_rules").select("*").eq("visit_id", visitId).order("created_at"),
    supabase
      .from("scheduled_whatsapp_sends")
      .select("id, rule_id, status, run_at, sent_at, last_error, attempts, visit_message_rules(name), visit_guests(leads(name, phone))")
      .eq("visit_id", visitId)
      .order("run_at"),
    supabase.from("message_rule_sets").select("id, name, message_rule_set_items(id)").eq("is_active", true).order("name"),
    supabase.from("visit_settings").select("sends_enabled, dry_run").maybeSingle(),
  ]);

  return {
    sequences: (sequences ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      itemCount: Array.isArray(s.message_rule_set_items) ? s.message_rule_set_items.length : 0,
    })),
    settings: { sendsEnabled: settings?.sends_enabled ?? false, dryRun: settings?.dry_run ?? true },
    rules: (rules ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      anchor: r.anchor,
      offsetMinutes: r.offset_minutes,
      templateName: r.template_name,
      templateLanguage: r.template_language,
      enabled: r.enabled,
    })),
    sends: (sends ?? []).map((s) => {
      const rule = Array.isArray(s.visit_message_rules) ? s.visit_message_rules[0] : s.visit_message_rules;
      const guest = Array.isArray(s.visit_guests) ? s.visit_guests[0] : s.visit_guests;
      const lead = guest ? (Array.isArray(guest.leads) ? guest.leads[0] : guest.leads) : null;
      return {
        id: s.id,
        ruleId: s.rule_id,
        ruleName: rule?.name ?? "Message",
        guestName: lead?.name ?? lead?.phone ?? null,
        status: s.status,
        runAt: s.run_at,
        sentAt: s.sent_at,
        lastError: s.last_error,
        attempts: s.attempts,
      };
    }),
  };
}

/** Puts a failed / skipped / unchecked send back in the queue (it goes out on the next tick). */
export async function requeueSend(id: string): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { data: row } = await supabase.from("scheduled_whatsapp_sends").select("status").eq("id", id).maybeSingle();
  if (!row) return { error: "That message no longer exists." };
  if (!(RESENDABLE_STATUSES as readonly string[]).includes(row.status)) {
    return { error: "Only failed, skipped, cancelled or unchecked messages can be sent again." };
  }
  const { error } = await supabase
    .from("scheduled_whatsapp_sends")
    .update({
      status: "queued",
      run_at: new Date().toISOString(),
      expires_at: null,
      attempts: 0,
      claimed_at: null,
      send_started_at: null,
      last_error: null,
      error_class: null,
    })
    .eq("id", id)
    .in("status", [...RESENDABLE_STATUSES]);
  if (error) return { error: "Could not queue the message again." };
  revalidateMessaging();
  return {};
}

export async function cancelSend(id: string): Promise<MessagingResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("scheduled_whatsapp_sends")
    .update({ status: "cancelled", last_error: "cancelled by a team member" })
    .eq("id", id)
    .eq("status", "queued");
  if (error) return { error: "Could not cancel the message." };
  revalidateMessaging();
  return {};
}

// ---------------------------------------------------------------------------
// Global settings (kill switch, dry run, quiet hours…)
// ---------------------------------------------------------------------------

export async function updateVisitSettings(input: SettingsInput): Promise<MessagingResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settings." };

  const supabase = await createClient();
  const { data: before } = await supabase.from("visit_settings").select("dry_run").maybeSingle();
  const { error } = await supabase
    .from("visit_settings")
    .update({
      sends_enabled: parsed.data.sendsEnabled,
      dry_run: parsed.data.dryRun,
      auto_complete_after_hours: parsed.data.autoCompleteAfterHours,
      quiet_start: parsed.data.quietStart,
      quiet_end: parsed.data.quietEnd,
      expiry_days: parsed.data.expiryDays,
      updated_by: email,
    })
    .eq("id", true);
  if (error) return { error: "Could not save the settings." };

  // Leaving dry run: messages recorded during it that haven't expired yet are meant to go out now
  // (otherwise a dry run on a real visit would silently send nothing once you go live).
  if (before?.dry_run && !parsed.data.dryRun) {
    await supabase
      .from("scheduled_whatsapp_sends")
      .update({ status: "queued", claimed_at: null, send_started_at: null, last_error: null, params_sent: null })
      .eq("status", "dry_run")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);
  }

  revalidateMessaging();
  return {};
}
