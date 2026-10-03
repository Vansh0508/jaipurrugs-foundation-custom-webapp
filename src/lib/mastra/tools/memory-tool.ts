import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/mastra/context";
import type { LeadLoader } from "@/lib/mastra/lead-context";
import { redactPhone } from "@/lib/mastra/redact";

const MAX_NOTES_PER_CONTACT = 50;

/**
 * Per-contact memory: short notes stored on the contact's lead and shown to
 * the agent at the start of every reply to that contact (and to staff in the
 * inbox profile). Scoped by the closure-captured phone like every other tool.
 */
export function createMemoryTools(ctx: AgentToolContext, leads: LeadLoader) {
  async function ensureLeadId(): Promise<string | null> {
    const { lead } = await leads.get();
    if (lead) return lead.id;
    const { data } = await ctx.supabase.rpc("agent_upsert_lead", {
      p_phone: ctx.phone,
      p_name: "",
      p_attributes: {},
    });
    leads.invalidate();
    return ((data ?? {}) as { lead_id?: string }).lead_id ?? null;
  }

  const rememberAboutContact = createTool({
    id: "remember-about-contact",
    description:
      "Save a short note to this contact's memory so you (and the team) remember it in future " +
      "conversations — preferences, circumstances, what they asked for, promises made. One fact " +
      "per note. Don't save details that belong in a lead field (use save-lead-details for those), " +
      "and never save phone numbers or other contact identifiers.",
    inputSchema: z.object({
      note: z.string().min(3).max(300).describe("One concise fact, e.g. 'Prefers replies in Hindi'."),
    }),
    execute: async ({ note }) => {
      const { memories } = await leads.get();
      if (memories.length >= MAX_NOTES_PER_CONTACT) {
        return { saved: false, error: "Memory is full — remove an outdated note first." };
      }
      const leadId = await ensureLeadId();
      if (!leadId) return { saved: false, error: "Could not save the note." };

      const { error } = await ctx.supabase.from("lead_memories").insert({
        lead_id: leadId,
        content: redactPhone(note.trim(), ctx.phone),
        source: "agent",
      });
      leads.invalidate();
      return error ? { saved: false, error: "Could not save the note." } : { saved: true };
    },
  });

  const forgetAboutContact = createTool({
    id: "forget-about-contact",
    description:
      "Remove an outdated or wrong note from this contact's memory, by its number in the memory list " +
      "shown in your instructions.",
    inputSchema: z.object({
      noteNumber: z.number().int().min(1).describe("The note's number in the memory list."),
    }),
    execute: async ({ noteNumber }) => {
      const { memories } = await leads.get();
      const note = memories[noteNumber - 1];
      if (!note) return { removed: false, error: `There is no note ${noteNumber}.` };
      const { error } = await ctx.supabase.from("lead_memories").delete().eq("id", note.id);
      leads.invalidate();
      return error ? { removed: false, error: "Could not remove the note." } : { removed: true };
    },
  });

  const requestHumanHelp = createTool({
    id: "request-human-help",
    description:
      "Hand the conversation to a team member: use when the contact asks for a person, has a " +
      "complaint or urgent problem, or needs something you can't answer from the knowledge base. " +
      "You stop replying automatically in this chat until the team takes over.",
    inputSchema: z.object({
      reason: z.string().min(3).max(200).describe("Why a person is needed, for the team."),
    }),
    execute: async ({ reason }) => {
      if (!ctx.onHandoff) {
        return { flagged: false, note: "Workbench simulation — in the inbox this would flag the chat for the team." };
      }
      await ctx.onHandoff(reason);
      return { flagged: true };
    },
  });

  return { rememberAboutContact, forgetAboutContact, requestHumanHelp };
}
