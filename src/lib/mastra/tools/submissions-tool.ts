import "server-only";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolContext } from "@/lib/mastra/context";

const MAX_VALUE_LENGTH = 500;

function compactValue(value: unknown): unknown {
  if (typeof value === "string" && value.length > MAX_VALUE_LENGTH) {
    return `${value.slice(0, MAX_VALUE_LENGTH)}…`;
  }
  return value;
}

export function createGetUserSubmissionsTool(ctx: AgentToolContext) {
  return createTool({
    id: "get-user-submissions",
    description:
      "Look up the form submissions linked to the WhatsApp number you are currently chatting with " +
      "(form name, date, completed or in progress, and the answers given). Takes no phone number: it " +
      "always uses the current contact's number and has no way to read anyone else's records.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(20).optional().describe("How many recent submissions to return (default 10)."),
    }),
    execute: async ({ limit }) => {
      const { data, error } = await ctx.supabase.rpc("agent_submissions_for_phone", {
        p_phone: ctx.phone,
        p_limit: limit ?? 10,
      });

      if (error) {
        return { found: 0, submissions: [], error: "Submission lookup failed." };
      }

      const submissions = (data ?? []).map((row) => ({
        formTitle: row.form_title,
        status: row.status,
        startedAt: row.created_at,
        completedAt: row.completed_at,
        answers: (Array.isArray(row.answers) ? row.answers : []).map((answer) => {
          const a = answer as { label?: string | null; type?: string; value?: unknown };
          return { question: a.label ?? "(untitled)", type: a.type, answer: compactValue(a.value) };
        }),
      }));

      return { found: submissions.length, submissions };
    },
  });
}
