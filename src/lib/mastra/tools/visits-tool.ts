import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/mastra/context";
import { redactPhone } from "@/lib/mastra/redact";
import { describeVisitRow, whenText } from "@/lib/mastra/visit-format";
import { visitStatusLabel } from "@/lib/visits/constants";
import { parseItinerary } from "@/lib/visits/schemas";

const MAX_TEXT = 600;

function trim(text: string | null | undefined) {
  if (!text) return null;
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

/**
 * Visit tools. getMyVisits and getVisitItinerary are phone-scoped in SQL (the
 * RPCs match on the conversation's number and re-check that the contact is a
 * guest on the visit), so they take no identity argument. getExperiences and
 * getVillages are the same for everyone — public programme information.
 */
export function createVisitTools(ctx: AgentToolContext) {
  const clean = (text: string) => redactPhone(text, ctx.phone);

  const getMyVisits = createTool({
    id: "get-my-visits",
    description:
      "List the visits the current contact is booked on or has attended: date, time (Indian Standard Time), " +
      "status, coordinator, the villages and the experiences planned. Takes no phone number — it always uses " +
      "the current contact and cannot read anyone else's visits. Use it for questions about their own visit " +
      "(when, where, who to contact, is it confirmed).",
    inputSchema: z.object({
      scope: z
        .enum(["upcoming", "past", "all"])
        .optional()
        .describe("upcoming = not yet finished; past = completed; all = everything (default)."),
    }),
    execute: async ({ scope }) => {
      const { data, error } = await ctx.supabase.rpc("agent_visits_for_phone", {
        p_phone: ctx.phone,
        p_scope: scope ?? "all",
        p_limit: 10,
      });
      if (error) return { found: 0, visits: [], error: "Visit lookup failed." };

      const visits = (data ?? []).map((row) => describeVisitRow(row, clean));
      if (visits.length === 0) {
        return {
          found: 0,
          visits: [],
          note: "No visits are recorded for this contact. Don't guess — offer to connect them with the team.",
        };
      }
      return { found: visits.length, visits };
    },
  });

  const getVisitItinerary = createTool({
    id: "get-visit-itinerary",
    description:
      "The full plan for one of the current contact's visits: villages, each planned experience with its " +
      "description, duration and step-by-step itinerary. Pass a visitId returned by getMyVisits. It only " +
      "works for the current contact's own visits.",
    inputSchema: z.object({
      visitId: z.string().uuid().describe("A visitId returned by getMyVisits."),
    }),
    execute: async ({ visitId }) => {
      const { data, error } = await ctx.supabase.rpc("agent_visit_itinerary_for_phone", {
        p_phone: ctx.phone,
        p_visit_id: visitId,
      });
      if (error) return { found: false, error: "Itinerary lookup failed." };
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return { found: false, note: "That visit isn't one of this contact's visits." };
      }

      const v = data as Record<string, unknown>;
      const experiences = (Array.isArray(v.experiences) ? v.experiences : []).map((raw) => {
        const e = raw as Record<string, unknown>;
        return {
          name: clean(String(e.name ?? "")),
          village: e.village ? clean(String(e.village)) : null,
          description: trim(e.description ? clean(String(e.description)) : null),
          durationMinutes: typeof e.durationMin === "number" ? e.durationMin : null,
          seasonalNote: e.seasonal ? clean(String(e.seasonal)) : null,
          steps: parseItinerary(e.itinerary).map((s) => ({
            step: clean(s.title),
            minutes: s.minutes,
            details: s.description ? clean(s.description) : null,
          })),
        };
      });

      return {
        found: true,
        visit: clean(String(v.visitType ?? "")),
        when: whenText(
          (v.date as string | null) ?? null,
          (v.startTime as string | null) ?? null,
          (v.endTime as string | null) ?? null,
        ),
        status: visitStatusLabel(String(v.status ?? "")),
        coordinator: v.coordinator ? clean(String(v.coordinator)) : null,
        coordinatorPhone: (v.coordinatorPhone as string | null) ?? null,
        host: v.facilitator ? clean(String(v.facilitator)) : null,
        villages: (Array.isArray(v.villages) ? v.villages : []).map((raw) => {
          const village = raw as Record<string, unknown>;
          return { name: clean(String(village.name ?? "")), region: village.region ? clean(String(village.region)) : null };
        }),
        experiences,
        note:
          experiences.length === 0
            ? "No experiences are attached to this visit yet — say the team will share the plan; don't invent one."
            : undefined,
      };
    },
  });

  const getExperiences = createTool({
    id: "get-experiences",
    description:
      "List the experiences guests can do in the foundation's villages (name, village, description, " +
      "typical duration, seasonal notes, itinerary). Optionally filter by village or category. Use it for " +
      "general questions like 'what can we do there?' — not for a specific booking (use getMyVisits).",
    inputSchema: z.object({
      village: z.string().min(2).max(80).optional().describe("Part of a village name."),
      category: z.string().min(2).max(80).optional().describe("Part of a category, e.g. craft or food."),
    }),
    execute: async ({ village, category }) => {
      const strip = (s: string) => s.replace(/[,()%*\\"]/g, " ").trim();
      let query = ctx.supabase
        .from("experiences")
        .select("name, description, category, duration_min, seasonal, featured, itinerary, villages!inner(name, region, is_active)")
        .eq("is_active", true)
        .eq("villages.is_active", true)
        .order("featured", { ascending: false })
        .order("name")
        .limit(20);
      if (village && strip(village)) query = query.ilike("villages.name", `%${strip(village)}%`);
      if (category && strip(category)) query = query.ilike("category", `%${strip(category)}%`);

      const { data, error } = await query;
      if (error) return { found: 0, experiences: [], error: "Experience lookup failed." };

      const experiences = (data ?? []).map((row) => {
        const v = row.villages as { name: string; region: string | null } | { name: string; region: string | null }[] | null;
        const vill = Array.isArray(v) ? v[0] : v;
        return {
          name: clean(row.name),
          village: vill ? clean(vill.name) : null,
          region: vill?.region ? clean(vill.region) : null,
          popular: row.featured,
          category: row.category ? clean(row.category) : null,
          description: trim(row.description ? clean(row.description) : null),
          durationMinutes: row.duration_min,
          seasonalNote: row.seasonal ? clean(row.seasonal) : null,
          steps: parseItinerary(row.itinerary).map((s) => ({ step: clean(s.title), minutes: s.minutes })),
        };
      });
      return experiences.length === 0
        ? { found: 0, experiences: [], note: "Nothing matches. Don't invent experiences — offer to connect them with the team." }
        : { found: experiences.length, experiences };
    },
  });

  const getVillages = createTool({
    id: "get-villages",
    description:
      "List the villages the foundation hosts guests in (name, region, craft). Use it when someone asks " +
      "where visits happen or which villages they could visit.",
    inputSchema: z.object({}),
    execute: async () => {
      const { data, error } = await ctx.supabase
        .from("villages")
        .select("name, region, craft_type")
        .eq("is_active", true)
        .order("name")
        .limit(30);
      if (error) return { found: 0, villages: [], error: "Village lookup failed." };
      const villages = (data ?? []).map((row) => ({
        name: clean(row.name),
        region: row.region ? clean(row.region) : null,
        craft: row.craft_type ? clean(row.craft_type) : null,
      }));
      return { found: villages.length, villages };
    },
  });

  return { getMyVisits, getVisitItinerary, getExperiences, getVillages };
}
