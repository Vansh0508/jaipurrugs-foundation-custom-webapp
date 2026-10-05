"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveTeamMember } from "@/lib/auth/session";
import type { LeadAttribute } from "@/lib/leads/fields";
import { toWhatsAppParticipantId } from "@/lib/mastra/phone";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/types/supabase";
import { parseBindings, resolveTemplateParams, type MissingValue } from "@/lib/whatsapp/bindings";
import { renderTemplatePreview, summarizeTemplate, type TemplateSummary } from "@/lib/whatsapp/templates";
import { serviceWindow } from "@/lib/whatsapp/window";
import {
  createWebhook,
  INBOX_WEBHOOK_EVENTS,
  listWebhooks,
  listWhatsAppTemplates,
  sendInboxMessage,
  sendWhatsAppTemplate,
} from "@/lib/zernio/client";

export type InboxConversation = Tables<"whatsapp_conversations">;
export type InboxMessage = Tables<"whatsapp_messages">;
export type LeadMemory = Tables<"lead_memories">;

export interface InboxThread {
  conversation: InboxConversation;
  messages: InboxMessage[];
  lead: Tables<"leads"> | null;
  leadLists: { id: string; name: string }[];
  memories: LeadMemory[];
  attributes: LeadAttribute[];
  /** Visits this contact is a guest on, most recent first. */
  visits: ContactVisit[];
}

export interface ContactVisit {
  id: string;
  visitType: string;
  visitDate: string | null;
  startTime: string | null;
  status: string;
  guestStatus: string;
}

type Result = { error?: string };

const MESSAGE_PAGE = 200;

async function loadConversation(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("whatsapp_conversations").select("*").eq("id", id).maybeSingle();
  return { supabase, conversation: data };
}

export async function getInboxThread(conversationId: string): Promise<InboxThread | null> {
  await requireActiveTeamMember();
  const { supabase, conversation } = await loadConversation(conversationId);
  if (!conversation) return null;

  const [{ data: messages }, { data: attributes }, leadResult, memoriesResult, listsResult, visitsResult] = await Promise.all([
    supabase
      .from("whatsapp_messages")
      .select("*")
      .eq("conversation_id", conversation.id)
      .order("sent_at", { ascending: false })
      .limit(MESSAGE_PAGE),
    supabase.from("lead_attributes").select("*").order("created_at"),
    conversation.lead_id
      ? supabase.from("leads").select("*").eq("id", conversation.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    conversation.lead_id
      ? supabase.from("lead_memories").select("*").eq("lead_id", conversation.lead_id).order("created_at")
      : Promise.resolve({ data: [] as LeadMemory[] }),
    conversation.lead_id
      ? supabase.from("lead_list_members").select("lead_lists(id, name)").eq("lead_id", conversation.lead_id)
      : Promise.resolve({ data: [] }),
    conversation.lead_id
      ? supabase
          .from("visit_guests")
          .select("status, visits(id, visit_type, visit_date, start_time, status)")
          .eq("lead_id", conversation.lead_id)
      : Promise.resolve({ data: [] }),
  ]);

  const visits: ContactVisit[] = (
    (visitsResult.data ?? []) as {
      status: string;
      visits: { id: string; visit_type: string; visit_date: string | null; start_time: string | null; status: string } | null;
    }[]
  )
    .flatMap((row) =>
      row.visits
        ? [
            {
              id: row.visits.id,
              visitType: row.visits.visit_type,
              visitDate: row.visits.visit_date,
              startTime: row.visits.start_time,
              status: row.visits.status,
              guestStatus: row.status,
            },
          ]
        : [],
    )
    .sort((a, b) => (b.visitDate ?? "9999").localeCompare(a.visitDate ?? "9999"));

  const leadLists = ((listsResult.data ?? []) as { lead_lists: unknown }[]).flatMap((m) => {
    const list = m.lead_lists as { id: string; name: string } | { id: string; name: string }[] | null;
    return Array.isArray(list) ? list : list ? [list] : [];
  });

  return {
    conversation,
    messages: (messages ?? []).reverse(),
    lead: leadResult.data ?? null,
    leadLists,
    memories: memoriesResult.data ?? [],
    attributes: attributes ?? [],
    visits,
  };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  await supabase.from("whatsapp_conversations").update({ unread_count: 0 }).eq("id", conversationId).gt("unread_count", 0);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

const textSchema = z.string().trim().min(1, "Message can't be empty.").max(4096);

/**
 * Free-form reply from a team member. Only inside the 24-hour window, and it
 * pauses the AI for this chat (staff takeover) until someone turns it back on.
 */
export async function sendStaffMessage(conversationId: string, text: string): Promise<Result> {
  const { email } = await requireActiveTeamMember();
  const parsed = textSchema.safeParse(text);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const { supabase, conversation } = await loadConversation(conversationId);
  if (!conversation) return { error: "Conversation not found." };
  if (!serviceWindow(conversation.last_inbound_at).open) {
    return { error: "The 24-hour window is closed — only an approved template can be sent now." };
  }

  const sent = await sendInboxMessage({
    accountId: conversation.zernio_account_id,
    conversationId: conversation.zernio_conversation_id,
    text: parsed.data,
    idempotencyKey: `staff-${randomUUID()}`,
  });

  const now = new Date().toISOString();
  await supabase.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    platform_message_id: sent.messageId ?? null,
    direction: "outbound",
    sender_type: "staff",
    sent_by: email,
    kind: "text",
    body: parsed.data,
    status: sent.success ? "sent" : "failed",
    error: sent.success ? null : (sent.error ?? "Send failed"),
    sent_at: now,
  });

  if (!sent.success) return { error: `WhatsApp didn't accept the message: ${sent.error}` };

  await supabase
    .from("whatsapp_conversations")
    .update({
      last_message_at: now,
      last_message_preview: parsed.data.slice(0, 120),
      unread_count: 0,
      ai_enabled: false,
      needs_human: false,
      handoff_reason: null,
    })
    .eq("id", conversation.id);
  return {};
}

export interface ComposerTemplate {
  summary: TemplateSummary;
  /** Every variable, with the lead's value pre-filled where known. */
  values: Record<string, string>;
  missing: MissingValue[];
  unbound: string[];
}

/** Approved templates with their variables resolved from this contact's lead. */
export async function getComposerTemplates(conversationId: string): Promise<{ templates: ComposerTemplate[]; error?: string }> {
  await requireActiveTeamMember();
  const { supabase, conversation } = await loadConversation(conversationId);
  if (!conversation) return { templates: [], error: "Conversation not found." };

  const [list, { data: bindingRows }, { data: attributes }, { data: lead }] = await Promise.all([
    listWhatsAppTemplates(conversation.zernio_account_id, { status: "APPROVED" }),
    supabase.from("whatsapp_template_bindings").select("template_name, language, variables"),
    supabase.from("lead_attributes").select("*"),
    conversation.lead_id
      ? supabase.from("leads").select("*").eq("id", conversation.lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!list.success) return { templates: [], error: list.error ?? "Could not load templates." };

  const templates = list.templates
    .filter((t) => t.status === "APPROVED")
    .map((template) => {
      const summary = summarizeTemplate(template);
      const bindings = parseBindings(
        (bindingRows ?? []).find((b) => b.template_name === template.name && b.language === template.language)?.variables,
      );
      // Resolve each variable on its own so known values pre-fill even when others are missing.
      const values: Record<string, string> = {};
      const missing: MissingValue[] = [];
      const unbound: string[] = [];
      for (const variable of summary.variables) {
        const binding = bindings.filter((b) => b.key === variable.key);
        const single = { ...summary, variables: [{ ...variable, index: 0 }] };
        const resolved = resolveTemplateParams(single, binding, lead ?? null, attributes ?? []);
        if (resolved.ok) values[variable.key] = resolved.params[0];
        else {
          missing.push(...resolved.missing);
          unbound.push(...resolved.unbound);
        }
      }
      return { summary, values, missing, unbound };
    });

  return { templates };
}

/**
 * Send an approved template — the only option outside the 24-hour window.
 * Values come from the lead; a team member may fill or override any of them.
 */
export async function sendTemplateFromInbox(
  conversationId: string,
  templateName: string,
  language: string,
  values: Record<string, string>,
): Promise<Result> {
  const { email } = await requireActiveTeamMember();
  const { supabase, conversation } = await loadConversation(conversationId);
  if (!conversation) return { error: "Conversation not found." };

  const participantId = conversation.contact_phone ? toWhatsAppParticipantId(conversation.contact_phone) : null;
  if (!participantId) return { error: "This contact has no phone number on record, so a template can't be sent." };

  const list = await listWhatsAppTemplates(conversation.zernio_account_id, { status: "APPROVED" });
  const template = list.templates.find((t) => t.name === templateName && t.language === language);
  if (!template) return { error: "That template isn't approved on this WhatsApp account." };

  const summary = summarizeTemplate(template);
  const params = summary.variables.map((v) => (values[v.key] ?? "").trim());
  const empty = summary.variables.filter((_, i) => !params[i]);
  if (empty.length > 0) return { error: `Fill in {{${empty[0].placeholder}}} before sending.` };

  const sent = await sendWhatsAppTemplate({
    accountId: conversation.zernio_account_id,
    participantId,
    templateName,
    templateLanguage: language,
    templateParams: params,
  });
  if (!sent.success) return { error: `WhatsApp didn't accept the template: ${sent.error}` };

  const preview = renderTemplatePreview(summary, params);
  const now = new Date().toISOString();
  await supabase.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    platform_message_id: sent.messageId ?? null,
    direction: "outbound",
    sender_type: "staff",
    sent_by: email,
    kind: "template",
    body: preview,
    template_name: templateName,
    template_language: language,
    status: "sent",
    sent_at: now,
  });
  await supabase
    .from("whatsapp_conversations")
    .update({ last_message_at: now, last_message_preview: preview.slice(0, 120), unread_count: 0 })
    .eq("id", conversation.id);
  return {};
}

// ---------------------------------------------------------------------------
// AI control
// ---------------------------------------------------------------------------

export async function setConversationAi(conversationId: string, enabled: boolean): Promise<Result> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ ai_enabled: enabled, ...(enabled ? { needs_human: false, handoff_reason: null } : {}) })
    .eq("id", conversationId);
  return error ? { error: "Could not update the chat." } : {};
}

export async function resolveHandoff(conversationId: string): Promise<Result> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("whatsapp_conversations")
    .update({ needs_human: false, handoff_reason: null })
    .eq("id", conversationId);
  return error ? { error: "Could not update the chat." } : {};
}

export async function setAutoReplyEnabled(enabled: boolean): Promise<Result> {
  const { email } = await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inbox_settings")
    .update({ auto_reply_enabled: enabled, updated_by: email })
    .eq("id", true);
  revalidatePath("/inbox");
  return error ? { error: "Could not update the setting." } : {};
}

// ---------------------------------------------------------------------------
// Memory notes
// ---------------------------------------------------------------------------

const noteSchema = z.string().trim().min(1, "Note can't be empty.").max(500);

export async function addLeadMemory(leadId: string, content: string): Promise<Result> {
  const { email } = await requireActiveTeamMember();
  const parsed = noteSchema.safeParse(content);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_memories")
    .insert({ lead_id: leadId, content: parsed.data, source: "staff", created_by: email });
  return error ? { error: "Could not save the note." } : {};
}

export async function updateLeadMemory(id: string, content: string): Promise<Result> {
  await requireActiveTeamMember();
  const parsed = noteSchema.safeParse(content);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.from("lead_memories").update({ content: parsed.data }).eq("id", id);
  return error ? { error: "Could not update the note." } : {};
}

export async function deleteLeadMemory(id: string): Promise<Result> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("lead_memories").delete().eq("id", id);
  return error ? { error: "Could not delete the note." } : {};
}

// ---------------------------------------------------------------------------
// Webhook setup
// ---------------------------------------------------------------------------

function webhookUrl() {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  return base ? `${base}/api/webhooks/zernio` : null;
}

export interface WebhookStatus {
  url: string | null;
  secretConfigured: boolean;
  registered: boolean;
  missingEvents: string[];
  error?: string;
}

export async function getInboxWebhookStatus(): Promise<WebhookStatus> {
  await requireActiveTeamMember();
  const url = webhookUrl();
  const secretConfigured = Boolean(process.env.ZERNIO_WEBHOOK_SECRET?.trim());
  if (!url) return { url, secretConfigured, registered: false, missingEvents: [], error: "NEXT_PUBLIC_SITE_URL is not set." };

  const result = await listWebhooks();
  if (!result.success) return { url, secretConfigured, registered: false, missingEvents: [], error: result.error };

  const hook = result.webhooks.find((w) => w.url === url && w.isActive);
  return {
    url,
    secretConfigured,
    registered: Boolean(hook),
    missingEvents: hook ? INBOX_WEBHOOK_EVENTS.filter((e) => !hook.events.includes(e)) : [...INBOX_WEBHOOK_EVENTS],
  };
}

export async function registerInboxWebhook(): Promise<Result> {
  await requireActiveTeamMember();
  const url = webhookUrl();
  const secret = process.env.ZERNIO_WEBHOOK_SECRET?.trim();
  if (!url) return { error: "Set NEXT_PUBLIC_SITE_URL to this app's public address first." };
  if (!secret) return { error: "Set ZERNIO_WEBHOOK_SECRET in the server environment first." };
  if (!url.startsWith("https://")) return { error: "Zernio needs a public https:// address for the webhook." };

  const result = await createWebhook({ name: "JRF Admin inbox", url, secret, events: INBOX_WEBHOOK_EVENTS });
  return result.success ? {} : { error: result.error ?? "Could not register the webhook." };
}
