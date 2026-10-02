import { requireActiveTeamMember } from "@/lib/auth/session";
import {
  getAgentSessionMessages,
  getAgentStatusAction,
  getPhoneSubmissionCount,
  listAgentSessions,
} from "@/lib/actions/agent";
import { createClient } from "@/lib/supabase/server";
import { AgentWorkbench } from "@/components/admin/agent/agent-workbench";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  await requireActiveTeamMember();
  const supabase = await createClient();

  const [status, sessions, { data: articles }] = await Promise.all([
    getAgentStatusAction(),
    listAgentSessions(),
    supabase
      .from("knowledge_base_articles")
      .select("id, title, category, content, tags, metadata, updated_at")
      .order("updated_at", { ascending: false }),
  ]);

  const firstSession = sessions[0];
  const [initialMessages, initialSubmissionCount] = firstSession
    ? await Promise.all([
        getAgentSessionMessages(firstSession.id),
        getPhoneSubmissionCount(firstSession.phoneNumber),
      ])
    : [[], null];

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">AI Agent</h1>
        <p className="text-sm text-muted">
          Test the WhatsApp assistant as a given contact and manage the knowledge base it answers from.
        </p>
      </div>
      <AgentWorkbench
        articles={articles ?? []}
        initialMessages={initialMessages}
        initialSessions={sessions}
        initialSubmissionCount={initialSubmissionCount}
        status={status}
      />
    </div>
  );
}
