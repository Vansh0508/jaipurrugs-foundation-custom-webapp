// Shapes shared between the agent server actions and the workbench UI.

export interface AgentTraceEntry {
  toolCallId: string;
  toolName: string;
  args: unknown;
  result: unknown;
  isError: boolean;
}

export interface AgentChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolTrace: AgentTraceEntry[];
  createdAt: string;
}

export interface AgentSession {
  id: string;
  phoneNumber: string;
  title: string | null;
  updatedAt: string;
}

export interface AgentStatus {
  openaiConfigured: boolean;
  model: string;
  whatsapp: {
    configured: boolean;
    accountLabel: string | null;
    error?: string;
  };
}
