"use client";

import { Tabs } from "@heroui/react";
import type { AgentChatMessage, AgentSession, AgentStatus } from "@/lib/mastra/types";
import { ChatSimulator } from "./chat-simulator";
import { KnowledgeBaseManager, type KbArticle } from "./knowledge-base-manager";

export function AgentWorkbench({
  status,
  initialSessions,
  initialMessages,
  initialSubmissionCount,
  articles,
}: {
  status: AgentStatus;
  initialSessions: AgentSession[];
  initialMessages: AgentChatMessage[];
  initialSubmissionCount: number | null;
  articles: KbArticle[];
}) {
  return (
    <Tabs className="flex min-h-0 flex-1 flex-col">
      <Tabs.ListContainer>
        <Tabs.List aria-label="Agent workbench">
          <Tabs.Tab id="simulator">
            Chat simulator
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="knowledge-base">
            Knowledge base ({articles.length})
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
      <Tabs.Panel className="min-h-0 flex-1 pt-4" id="simulator">
        <ChatSimulator
          initialMessages={initialMessages}
          initialSessions={initialSessions}
          initialSubmissionCount={initialSubmissionCount}
          status={status}
        />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="knowledge-base">
        <KnowledgeBaseManager articles={articles} />
      </Tabs.Panel>
    </Tabs>
  );
}
