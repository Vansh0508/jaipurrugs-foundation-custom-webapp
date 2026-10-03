import { requireActiveTeamMember } from "@/lib/auth/session";
import { getInboxThread, getInboxWebhookStatus } from "@/lib/actions/inbox";
import { isAgentConfigured } from "@/lib/mastra/agent";
import { createClient } from "@/lib/supabase/server";
import { InboxView } from "@/components/admin/inbox/inbox-view";

export const dynamic = "force-dynamic";

const CONVERSATION_LIMIT = 200;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  await requireActiveTeamMember();
  const { c } = await searchParams;
  const supabase = await createClient();

  const [{ data: conversations }, { data: settings }, webhook] = await Promise.all([
    supabase
      .from("whatsapp_conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(CONVERSATION_LIMIT),
    supabase.from("inbox_settings").select("auto_reply_enabled").maybeSingle(),
    getInboxWebhookStatus(),
  ]);

  const activeId = c ?? conversations?.[0]?.id ?? null;
  const thread = activeId ? await getInboxThread(activeId) : null;

  return (
    <InboxView
      agentConfigured={isAgentConfigured()}
      autoReplyEnabled={settings?.auto_reply_enabled ?? true}
      conversations={conversations ?? []}
      thread={thread}
      webhook={webhook}
    />
  );
}
