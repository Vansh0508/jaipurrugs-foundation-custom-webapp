import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/supabase";

/**
 * Everything a tool needs for one conversation turn. Built by the server
 * action from trusted inputs (the session row, the admin's toggle) and
 * captured in each tool's closure — none of it is a tool argument, so the
 * model can't redirect a tool at a different phone number.
 */
export interface AgentToolContext {
  /** The contact's WhatsApp number, from agent_chat_sessions.phone_number. */
  phone: string;
  /** RLS-bound client for the signed-in team member. */
  supabase: SupabaseClient<Database>;
  /** Off by default: sendWhatsAppTemplate only renders a preview. */
  liveSend: boolean;
  /** Resolves the connected Zernio WhatsApp account, memoized per turn. */
  getWhatsAppAccountId: () => Promise<string | null>;
}
