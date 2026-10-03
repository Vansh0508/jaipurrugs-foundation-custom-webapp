import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { leadAttributeValues } from "@/lib/leads/fields";
import type { AgentToolContext } from "@/lib/mastra/context";
import type { LeadLoader } from "@/lib/mastra/lead-context";

export function createLeadTools(ctx: AgentToolContext, leads: LeadLoader) {
  const getLeadProfile = createTool({
    id: "get-lead-profile",
    description:
      "Read what the foundation knows about the contact you are chatting with: their name, the lead " +
      "lists they're in, and every lead field (with its type, allowed options and current value, or " +
      "null if not collected yet). Takes no phone number: it always reads the current contact.",
    inputSchema: z.object({}),
    execute: async () => {
      const { lead, lists, attributes } = await leads.get();
      const values = lead ? leadAttributeValues(lead) : {};
      return {
        exists: Boolean(lead),
        name: lead?.name ?? null,
        lists,
        fields: attributes
          .filter((a) => a.is_active)
          .map((a) => ({
            key: a.key,
            label: a.label,
            type: a.type,
            options: a.type === "select" ? a.options : undefined,
            whatToAsk: a.description ?? undefined,
            value: values[a.key] ?? null,
          })),
      };
    },
  });

  const saveLeadDetails = createTool({
    id: "save-lead-details",
    description:
      "Save details the contact has told you to their lead record (creating it if needed). Use the " +
      "field keys from get-lead-profile. Only save what the contact actually said — never guess. " +
      "Takes no phone number: it always saves to the current contact.",
    inputSchema: z.object({
      name: z.string().max(120).optional().describe("The contact's name, if they gave it."),
      fields: z
        .record(z.string(), z.string().max(500))
        .optional()
        .describe("Field key → value as the contact said it, e.g. { village: 'Bhadohi' }."),
    }),
    execute: async ({ name, fields }) => {
      const { data, error } = await ctx.supabase.rpc("agent_upsert_lead", {
        p_phone: ctx.phone,
        p_name: name ?? "",
        p_attributes: fields ?? {},
      });
      leads.invalidate();

      if (error) return { saved: [], error: "Could not save the contact's details." };

      const result = (data ?? {}) as { saved?: string[]; rejected?: { key: string; reason: string }[] };
      return {
        savedName: Boolean(name?.trim()),
        saved: result.saved ?? [],
        rejected: result.rejected ?? [],
        ...(result.rejected?.length
          ? { note: "Rejected values weren't saved — ask the contact again in the right form." }
          : {}),
      };
    },
  });

  return { getLeadProfile, saveLeadDetails };
}
