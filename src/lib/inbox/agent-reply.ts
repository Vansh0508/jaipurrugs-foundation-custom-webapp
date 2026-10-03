import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AGENT_MAX_STEPS, createFoundationAgent, isAgentConfigured } from "@/lib/mastra/agent";
import { redactPhone } from "@/lib/mastra/redact";
import { collectTrace } from "@/lib/mastra/trace";
import type { Database, Json, Tables } from "@/lib/types/supabase";
import { serviceWindow } from "@/lib/whatsapp/window";
import { sendInboxMessage } from "@/lib/zernio/client";

type Admin = SupabaseClient<Database>;
type Message = Tables<"whatsapp_messages">;
type ChatTurn = { role: "user"; content: string } | { role: "assistant"; content: string };

const HISTORY_LIMIT = 30;
/** Contacts often send several short messages in a row; reply once, to all of them. */
export const REPLY_DEBOUNCE_MS = 4000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Thread → model messages. The contact's number is scrubbed from everything. */
export function toChatTurns(messages: Message[], phone: string): ChatTurn[] {
  return messages.flatMap((m): ChatTurn[] => {
    const text =
      m.body?.trim() ||
      (m.kind === "media" ? "[sent an attachment]" : m.kind === "template" ? `[template: ${m.template_name ?? "message"}]` : "");
    if (!text) return [];
    const content = redactPhone(text, phone);
    if (m.direction === "inbound") return [{ role: "user", content }];
    // Staff replies are part of the conversation the agent continues.
    return [{ role: "assistant", content: m.sender_type === "staff" ? `[Team member replied] ${content}` : content }];
  });
}

async function isLatestInbound(admin: Admin, conversationId: string, messageId: string) {
  const { data } = await admin
    .from("whatsapp_messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id === messageId;
}

async function canAutoReply(admin: Admin, conversationId: string) {
  const [{ data: settings }, { data: conversation }] = await Promise.all([
    admin.from("inbox_settings").select("auto_reply_enabled").maybeSingle(),
    admin.from("whatsapp_conversations").select("*").eq("id", conversationId).maybeSingle(),
  ]);
  if (!conversation || settings?.auto_reply_enabled === false) return null;
  if (!conversation.ai_enabled || conversation.needs_human) return null;
  // The agent's tools are keyed on the contact's number; a username-only
  // (BSUID) contact has none, so a team member handles them.
  if (!conversation.contact_phone) return null;
  if (!serviceWindow(conversation.last_inbound_at).open) return null;
  return conversation;
}

/**
 * Automatic agent reply to an inbound WhatsApp message. Runs after the
 * webhook has already returned 200 (Next.js `after`). Only the newest inbound
 * message in a burst gets a reply, and nothing is sent if a team member took
 * over while the agent was thinking.
 */
export async function replyWithAgent(
  admin: Admin,
  trigger: { conversationId: string; messageId: string },
  // Test seams: a mock model and a shorter debounce. Production uses the defaults.
  options: { model?: NonNullable<Parameters<typeof createFoundationAgent>[1]>["model"]; debounceMs?: number } = {},
) {
  if (!options.model && !isAgentConfigured()) return;

  await sleep(options.debounceMs ?? REPLY_DEBOUNCE_MS);
  if (!(await isLatestInbound(admin, trigger.conversationId, trigger.messageId))) return;

  const conversation = await canAutoReply(admin, trigger.conversationId);
  if (!conversation?.contact_phone) return;

  const { data: recent } = await admin
    .from("whatsapp_messages")
    .select("*")
    .eq("conversation_id", conversation.id)
    .order("sent_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const turns = toChatTurns((recent ?? []).reverse(), conversation.contact_phone);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") return;

  const agent = createFoundationAgent({
    phone: conversation.contact_phone,
    supabase: admin,
    liveSend: true,
    channel: "inbox",
    getWhatsAppAccountId: async () => conversation.zernio_account_id,
    onHandoff: async (reason) => {
      await admin
        .from("whatsapp_conversations")
        .update({ needs_human: true, handoff_reason: reason })
        .eq("id", conversation.id);
    },
    onTemplateSent: async (info) => {
      const now = new Date().toISOString();
      await admin.from("whatsapp_messages").insert({
        conversation_id: conversation.id,
        platform_message_id: info.platformMessageId ?? null,
        direction: "outbound",
        sender_type: "agent",
        kind: "template",
        body: info.preview,
        template_name: info.templateName,
        template_language: info.language,
        status: "sent",
        sent_at: now,
      });
      await admin
        .from("whatsapp_conversations")
        .update({ last_message_at: now, last_message_preview: info.preview.slice(0, 120) })
        .eq("id", conversation.id);
    },
  }, { model: options.model });

  let text: string;
  let trace;
  try {
    const output = await agent.generate(turns, { maxSteps: AGENT_MAX_STEPS });
    text = output.text?.trim() ?? "";
    trace = collectTrace(output as Parameters<typeof collectTrace>[0]);
  } catch (err) {
    console.error("[inbox] agent reply failed", conversation.id, err);
    return;
  }
  if (!text) return;

  // Re-check after generation: a newer message, a staff takeover or a
  // handoff during the run all mean this reply should not go out.
  if (!(await isLatestInbound(admin, conversation.id, trigger.messageId))) return;
  const stillAllowed = await canAutoReply(admin, conversation.id);
  const handedOff = trace.some((t) => t.toolName === "requestHumanHelp" && !t.isError);
  if (!stillAllowed && !handedOff) return;

  const sent = await sendInboxMessage({
    accountId: conversation.zernio_account_id,
    conversationId: conversation.zernio_conversation_id,
    text,
    idempotencyKey: `agent-reply-${trigger.messageId}`,
  });

  const now = new Date().toISOString();
  await admin.from("whatsapp_messages").insert({
    conversation_id: conversation.id,
    platform_message_id: sent.messageId ?? null,
    direction: "outbound",
    sender_type: "agent",
    kind: "text",
    body: text,
    status: sent.success ? "sent" : "failed",
    error: sent.success ? null : (sent.error ?? "Send failed"),
    tool_trace: trace as unknown as Json,
    sent_at: now,
  });
  await admin
    .from("whatsapp_conversations")
    .update({ last_message_at: now, last_message_preview: text.slice(0, 120) })
    .eq("id", conversation.id);
}
