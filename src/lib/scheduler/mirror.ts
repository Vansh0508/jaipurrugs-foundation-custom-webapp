import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/supabase";

type Admin = SupabaseClient<Database>;

/**
 * Records a template the scheduler just sent in the inbox thread, so staff and the agent see it.
 *
 * Zernio's message.sent webhook may record the same message first (as 'external'), or after us.
 * The row is matched on the wamid either way; when it already exists only the descriptive columns
 * are updated, never `status`, so a "delivered" that arrived early isn't downgraded to "sent".
 */
export async function recordSystemTemplate(
  admin: Admin,
  input: {
    accountId: string;
    lead: { id: string; name: string | null; phone: string };
    zernioConversationId: string | undefined;
    platformMessageId: string | undefined;
    templateName: string;
    language: string;
    preview: string;
  },
): Promise<void> {
  if (!input.zernioConversationId) return;
  const now = new Date().toISOString();

  const { data: existingConversation } = await admin
    .from("whatsapp_conversations")
    .select("id, lead_id")
    .eq("zernio_conversation_id", input.zernioConversationId)
    .maybeSingle();

  let conversationId = existingConversation?.id ?? null;
  if (existingConversation) {
    if (!existingConversation.lead_id) {
      await admin.from("whatsapp_conversations").update({ lead_id: input.lead.id }).eq("id", existingConversation.id);
    }
  } else {
    const { data: created } = await admin
      .from("whatsapp_conversations")
      .upsert(
        {
          zernio_conversation_id: input.zernioConversationId,
          zernio_account_id: input.accountId,
          contact_phone: input.lead.phone,
          contact_name: input.lead.name,
          lead_id: input.lead.id,
        },
        { onConflict: "zernio_conversation_id" },
      )
      .select("id")
      .single();
    conversationId = created?.id ?? null;
  }
  if (!conversationId) return;

  const descriptive = {
    sender_type: "system",
    kind: "template",
    body: input.preview,
    template_name: input.templateName,
    template_language: input.language,
  };

  const { data: existingMessage } = input.platformMessageId
    ? await admin.from("whatsapp_messages").select("id").eq("platform_message_id", input.platformMessageId).maybeSingle()
    : { data: null };

  if (existingMessage) {
    await admin.from("whatsapp_messages").update(descriptive).eq("id", existingMessage.id);
  } else {
    await admin.from("whatsapp_messages").insert({
      conversation_id: conversationId,
      platform_message_id: input.platformMessageId ?? null,
      direction: "outbound",
      status: "sent",
      sent_at: now,
      ...descriptive,
    });
  }

  await admin
    .from("whatsapp_conversations")
    .update({ last_message_at: now, last_message_preview: input.preview.slice(0, 120) })
    .eq("id", conversationId);
}
