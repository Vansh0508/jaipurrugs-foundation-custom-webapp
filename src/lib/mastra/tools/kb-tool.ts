import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/mastra/context";

export function createSearchKnowledgeBaseTool(ctx: AgentToolContext) {
  return createTool({
    id: "search-knowledge-base",
    description:
      "Search the foundation's knowledge base (FAQs, programme and scheme details, artisan guidelines, " +
      "field-visit information). Use it before answering any question about the foundation, and answer " +
      "only from what it returns.",
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

      const articles = (data ?? []).map((row) => ({
        title: row.title,
        category: row.category,
        excerpt: row.excerpt,
      }));

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
