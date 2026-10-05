import "server-only";
import type { AgentToolContext } from "@/lib/mastra/context";
import { normalizePhone } from "@/lib/mastra/phone";
import type { VisitRowLike } from "@/lib/mastra/visit-format";

export interface VisitSnapshot {
  /** Soonest first. */
  upcoming: VisitRowLike[];
  latestCompleted: VisitRowLike | null;
  /** The last message the scheduler sent this contact on its own, if it was recent. */
  lastAutomatic: { templateName: string | null; text: string; hoursAgo: number } | null;
}

// A reply to an automatic message is almost always about that message, but only for a day or two.
const AUTOMATIC_MESSAGE_WINDOW_HOURS = 48;

/**
 * Loads the contact's own visits once per turn, through the phone-scoped RPC, so
 * the prompt can say which visit a reply (for example to a thank-you template) is
 * about. A failed lookup just means "no visit context" — never an error in a reply.
 */
export function createVisitLoader(ctx: AgentToolContext) {
  let cached: Promise<VisitSnapshot> | null = null;

  async function load(): Promise<VisitSnapshot> {
    const normalized = normalizePhone(ctx.phone);
    const since = new Date(Date.now() - AUTOMATIC_MESSAGE_WINDOW_HOURS * 3_600_000).toISOString();
    const [upcoming, past, conversation] = await Promise.all([
      ctx.supabase.rpc("agent_visits_for_phone", { p_phone: ctx.phone, p_scope: "upcoming", p_limit: 3 }),
      ctx.supabase.rpc("agent_visits_for_phone", { p_phone: ctx.phone, p_scope: "past", p_limit: 1 }),
      normalized
        ? ctx.supabase
            .from("whatsapp_conversations")
            .select("id")
            .eq("contact_phone_normalized", normalized)
            .order("last_message_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    let lastAutomatic: VisitSnapshot["lastAutomatic"] = null;
    if (conversation.data) {
      const { data: message } = await ctx.supabase
        .from("whatsapp_messages")
        .select("template_name, body, sent_at")
        .eq("conversation_id", conversation.data.id)
        .eq("sender_type", "system")
        .gte("sent_at", since)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (message?.body) {
        lastAutomatic = {
          templateName: message.template_name,
          text: message.body,
          hoursAgo: Math.max(0, Math.round((Date.now() - new Date(message.sent_at).getTime()) / 3_600_000)),
        };
      }
    }

    return {
      upcoming: upcoming.error ? [] : (upcoming.data ?? []),
      latestCompleted: past.error ? null : (past.data?.[0] ?? null),
      lastAutomatic,
    };
  }

  return { get: () => (cached ??= load()) };
}

export type VisitLoader = ReturnType<typeof createVisitLoader>;
