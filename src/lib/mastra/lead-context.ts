import "server-only";
import type { LeadAttribute } from "@/lib/leads/fields";
import type { AgentToolContext } from "@/lib/mastra/context";
import { normalizePhone } from "@/lib/mastra/phone";
import type { Tables } from "@/lib/types/supabase";

export type MemoryNote = Pick<Tables<"lead_memories">, "id" | "content" | "source" | "created_at">;

export interface LeadSnapshot {
  lead: Pick<Tables<"leads">, "id" | "name" | "phone" | "attributes"> | null;
  lists: string[];
  /** Oldest first. The agent refers to them by 1-based position. */
  memories: MemoryNote[];
  /** Every attribute (inactive ones too, so callers can tell "deactivated" from "unknown"). */
  attributes: LeadAttribute[];
}

/**
 * Loads the conversation contact's lead once per turn and shares it between
 * the lead tools and the template tools. `invalidate()` after a write so the
 * next read (e.g. a template send right after saving details) sees it.
 */
export function createLeadLoader(ctx: AgentToolContext) {
  let cached: Promise<LeadSnapshot> | null = null;

  async function load(): Promise<LeadSnapshot> {
    const normalized = normalizePhone(ctx.phone);
    const [{ data: lead }, { data: attributes }] = await Promise.all([
      normalized
        ? ctx.supabase
            .from("leads")
            .select("id, name, phone, attributes")
            .eq("phone_normalized", normalized)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      ctx.supabase.from("lead_attributes").select("*").order("created_at"),
    ]);

    let lists: string[] = [];
    let memories: MemoryNote[] = [];
    if (lead) {
      const [{ data: memberships }, { data: notes }] = await Promise.all([
        ctx.supabase.from("lead_list_members").select("lead_lists(name)").eq("lead_id", lead.id),
        ctx.supabase
          .from("lead_memories")
          .select("id, content, source, created_at")
          .eq("lead_id", lead.id)
          .order("created_at"),
      ]);
      memories = notes ?? [];
      lists = (memberships ?? []).flatMap((m) => {
        const list = m.lead_lists as { name: string } | { name: string }[] | null;
        return Array.isArray(list) ? list.map((l) => l.name) : list ? [list.name] : [];
      });
    }

    return { lead: lead ?? null, lists, memories, attributes: attributes ?? [] };
  }

  return {
    get: () => (cached ??= load()),
    invalidate: () => {
      cached = null;
    },
  };
}

export type LeadLoader = ReturnType<typeof createLeadLoader>;
