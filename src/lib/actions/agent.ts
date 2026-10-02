"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveTeamMember } from "@/lib/auth/session";
import {
  AGENT_MAX_STEPS,
  AGENT_MODEL,
  createFoundationAgent,
  isAgentConfigured,
} from "@/lib/mastra/agent";
import { normalizePhone } from "@/lib/mastra/phone";
import { collectTrace } from "@/lib/mastra/trace";
import type {
  AgentChatMessage,
  AgentSession,
  AgentStatus,
  AgentTraceEntry,
} from "@/lib/mastra/types";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/types/supabase";
import { getWhatsAppAccounts, type WhatsAppAccount } from "@/lib/zernio/client";

// How many earlier messages are replayed to the model each turn.
const HISTORY_LIMIT = 20;

function pickWhatsAppAccount(accounts: WhatsAppAccount[]) {
  return accounts.find((a) => a.isActive) ?? accounts[0] ?? null;
}

function toSession(row: Tables<"agent_chat_sessions">): AgentSession {
  return { id: row.id, phoneNumber: row.phone_number, title: row.title, updatedAt: row.updated_at };
}

function toMessage(row: Tables<"agent_chat_messages">): AgentChatMessage {
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    toolTrace: Array.isArray(row.tool_trace) ? (row.tool_trace as unknown as AgentTraceEntry[]) : [],
    createdAt: row.created_at,
  };
}

export async function getAgentStatusAction(): Promise<AgentStatus> {
  await requireActiveTeamMember();
  const accounts = await getWhatsAppAccounts();
  const account = pickWhatsAppAccount(accounts.accounts);

  return {
    openaiConfigured: isAgentConfigured(),
    model: AGENT_MODEL,
    whatsapp: {
      configured: Boolean(account),
      accountLabel: account ? (account.verifiedName || account.displayName || account.phoneNumber || null) : null,
      error: accounts.success ? undefined : accounts.error,
    },
  };
}

export async function listAgentSessions(): Promise<AgentSession[]> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_chat_sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(50);
  return (data ?? []).map(toSession);
}

export async function createAgentSession(
  phoneNumber: string,
): Promise<{ session?: AgentSession; error?: string }> {
  const { email } = await requireActiveTeamMember();
  const phone = phoneNumber.trim();
  if (!normalizePhone(phone)) return { error: "Enter a valid phone number (at least 10 digits)." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("agent_chat_sessions")
    .insert({ phone_number: phone, created_by: email })
    .select("*")
    .single();

  if (error || !data) return { error: "Could not start a session." };
  revalidatePath("/agents");
  return { session: toSession(data) };
}

export async function deleteAgentSession(sessionId: string): Promise<{ error?: string }> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("agent_chat_sessions").delete().eq("id", sessionId);
  if (error) return { error: "Could not delete the session." };
  revalidatePath("/agents");
  return {};
}

export async function getAgentSessionMessages(sessionId: string): Promise<AgentChatMessage[]> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return (data ?? []).map(toMessage);
}

/** Same lookup the agent's tool uses, so the count in the contact bar matches what it can see. */
export async function getPhoneSubmissionCount(phoneNumber: string): Promise<number | null> {
  await requireActiveTeamMember();
  if (!normalizePhone(phoneNumber)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agent_submissions_for_phone", {
    p_phone: phoneNumber,
    p_limit: 50,
  });
  return error ? null : (data ?? []).length;
}

const sendSchema = z.object({
  sessionId: z.string().uuid(),
  content: z.string().trim().min(1).max(2000),
  liveSend: z.boolean(),
});

export async function sendAgentMessage(input: z.input<typeof sendSchema>): Promise<{
  userMessage?: AgentChatMessage;
  assistantMessage?: AgentChatMessage;
  error?: string;
}> {
  await requireActiveTeamMember();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { error: "Message can't be empty." };
  if (!isAgentConfigured()) return { error: "OPENAI_API_KEY is not configured on the server." };

  const { sessionId, content, liveSend } = parsed.data;
  const supabase = await createClient();

  // The phone comes from the stored session row, never from the client or the model.
  const { data: session } = await supabase
    .from("agent_chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { error: "Session not found." };

  const { data: history } = await supabase
    .from("agent_chat_messages")
    .select("role, content")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);

  const { data: userRow, error: userError } = await supabase
    .from("agent_chat_messages")
    .insert({ session_id: sessionId, role: "user", content })
    .select("*")
    .single();
  if (userError || !userRow) return { error: "Could not save your message." };

  let accountIdPromise: Promise<string | null> | null = null;
  const agent = createFoundationAgent({
    phone: session.phone_number,
    supabase,
    liveSend,
    getWhatsAppAccountId: () => {
      accountIdPromise ??= getWhatsAppAccounts().then(
        (r) => pickWhatsAppAccount(r.accounts)?.accountId ?? null,
      );
      return accountIdPromise;
    },
  });

  type ChatTurn = { role: "user"; content: string } | { role: "assistant"; content: string };
  const messages: ChatTurn[] = [
    ...(history ?? []).reverse().map(
      (m): ChatTurn =>
        m.role === "assistant"
          ? { role: "assistant", content: m.content }
          : { role: "user", content: m.content },
    ),
    { role: "user", content },
  ];

  let replyText: string;
  let trace: AgentTraceEntry[];
  try {
    const output = await agent.generate(messages, { maxSteps: AGENT_MAX_STEPS });
    replyText = output.text?.trim() || "(The agent returned no text.)";
    trace = collectTrace(output as Parameters<typeof collectTrace>[0]);
  } catch (err) {
    return {
      userMessage: toMessage(userRow),
      error: err instanceof Error ? `Agent error: ${err.message}` : "The agent failed to respond.",
    };
  }

  const { data: assistantRow, error: assistantError } = await supabase
    .from("agent_chat_messages")
    .insert({
      session_id: sessionId,
      role: "assistant",
      content: replyText,
      tool_trace: trace as unknown as Json,
    })
    .select("*")
    .single();
  if (assistantError || !assistantRow) {
    return { userMessage: toMessage(userRow), error: "Could not save the agent's reply." };
  }

  await supabase
    .from("agent_chat_sessions")
    .update({ title: session.title ?? content.slice(0, 80) })
    .eq("id", sessionId);

  return { userMessage: toMessage(userRow), assistantMessage: toMessage(assistantRow) };
}
