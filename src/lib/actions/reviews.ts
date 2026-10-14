"use server";

import { revalidatePath } from "next/cache";
import { isAgentConfigured } from "@/lib/mastra/agent";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { isFirecrawlConfigured } from "@/lib/reviews/firecrawl";
import { isReviewSource } from "@/lib/reviews/sources";
import { syncReviews } from "@/lib/reviews/sync";
import { createClient } from "@/lib/supabase/server";

export type SyncReviewsResult = { error?: string; found?: number; inserted?: number; warning?: string };

export async function syncReviewsFromSource(source: string): Promise<SyncReviewsResult> {
  await requireActiveTeamMember();
  if (!isReviewSource(source)) return { error: "Unknown review source." };
  if (!isFirecrawlConfigured()) return { error: "Firecrawl isn't configured. Set FIRECRAWL_API_KEY on the server." };
  if (!isAgentConfigured()) return { error: "The AI agent isn't configured. Set OPENAI_API_KEY on the server." };

  // The user's own client, not service-role: RLS (active team members only) stays the boundary.
  const supabase = await createClient();
  const result = await syncReviews(source, supabase);
  // A failure part-way through (e.g. the second listing) may still have saved reviews from the first.
  if (result.ok || result.inserted) revalidatePath("/partners");
  if (!result.ok) return { error: result.error };

  return { found: result.found, inserted: result.inserted, warning: result.warning };
}
