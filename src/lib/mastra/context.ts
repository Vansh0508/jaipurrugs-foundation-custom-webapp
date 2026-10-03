import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/supabase";

export interface SentTemplateInfo {
  templateName: string;
  language: string;
  /** Rendered text, for the inbox thread. */
  preview: string;
  platformMessageId?: string;
  zernioConversationId?: string;
}

/**
 * Everything a tool needs for one conversation turn. Built by the server
 * from trusted inputs (the session/conversation row, the admin's toggle) and
 * captured in each tool's closure — none of it is a tool argument, and the
 * phone is never placed in the model's context (see redact.ts).
 */
export interface AgentToolContext {
  /** The contact's WhatsApp number. Server-side identity only — never shown to the model. */
  phone: string;
  /** RLS-bound client in the workbench; service-role in the webhook path. */
  supabase: SupabaseClient<Database>;
  /** Off in the workbench by default: sendWhatsAppTemplate only renders a preview. */
  liveSend: boolean;
  /** Resolves the connected Zernio WhatsApp account, memoized per turn. */
  getWhatsAppAccountId: () => Promise<string | null>;
  /** "inbox" when replying to a real WhatsApp conversation. */
  channel: "simulator" | "inbox";
  /** Inbox only: flag the conversation for a team member. */
  onHandoff?: (reason: string) => Promise<void>;
  /** Inbox only: record a template the agent sent into the thread. */
  onTemplateSent?: (info: SentTemplateInfo) => Promise<void>;
}
