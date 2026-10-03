import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/mastra/context";

// search_knowledge_base only returns a short highlighted snippet (two fragments
// of ~40 words), which cuts off itineraries, price lists and policies mid-way.
// The agent gets each matched article's full text instead, capped so a few
// long articles can't swamp the context.
const MAX_ARTICLE_CHARS = 2500;

export function createSearchKnowledgeBaseTool(ctx: AgentToolContext) {
  return createTool({
    id: "search-knowledge-base",
    description:
      "Search the foundation's knowledge base (FAQs, programme and scheme details, artisan guidelines, " +
      "field-visit and Rural Experience information, pricing, booking and policies). Use it before " +
      "answering any question about the foundation, and answer only from the article text it returns.",
    inputSchema: z.object({
      query: z.string().min(2).max(200).describe("Keywords or the user's question, in English."),
    }),
    execute: async ({ query }) => {
      const { data, error } = await ctx.supabase.rpc("search_knowledge_base", {
        p_query: query,
        p_limit: 5,
      });

      if (error) {
        return { matched: 0, articles: [], error: "Knowledge base search failed." };
      }

      const rows = data ?? [];
      const { data: full } = rows.length
        ? await ctx.supabase
            .from("knowledge_base_articles")
            .select("id, content")
            .in("id", rows.map((row) => row.id))
        : { data: [] };
      const contentById = new Map((full ?? []).map((a) => [a.id, a.content]));

      const articles = rows.map((row) => {
        const content = contentById.get(row.id) ?? row.excerpt;
        return {
          title: row.title,
          category: row.category,
          content: content.length > MAX_ARTICLE_CHARS ? `${content.slice(0, MAX_ARTICLE_CHARS)}…` : content,
        };
      });

      if (articles.length === 0) {
        return {
          matched: 0,
          articles,
          note: "Nothing matched. Don't guess — say you don't have that information and offer to connect them with the foundation team.",
        };
      }

      return { matched: articles.length, articles };
    },
  });
}
