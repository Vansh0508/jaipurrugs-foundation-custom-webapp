"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireActiveTeamMember } from "@/lib/auth/session";
import { parseKbMarkdown, type KbImportIssue } from "@/lib/mastra/kb-import";
import { KB_CATEGORIES } from "@/lib/mastra/kb-categories";
import { SAMPLE_KB_ARTICLES } from "@/lib/mastra/seed-kb";
import { createClient } from "@/lib/supabase/server";

export type KbActionResult = { error?: string };

const categoryIds = KB_CATEGORIES.map((c) => c.id) as [string, ...string[]];

const articleSchema = z.object({
  title: z.string().trim().min(1, "Title is required.").max(200),
  category: z.enum(categoryIds),
  content: z.string().trim().min(1, "Content is required.").max(20000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
});

export type KbArticleInput = z.input<typeof articleSchema>;

export async function createKbArticle(input: KbArticleInput): Promise<KbActionResult> {
  const { email } = await requireActiveTeamMember();
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid article." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_base_articles")
    .insert({ ...parsed.data, created_by: email });

  if (error) return { error: "Could not save the article." };
  revalidatePath("/agents");
  return {};
}

export async function updateKbArticle(id: string, input: KbArticleInput): Promise<KbActionResult> {
  await requireActiveTeamMember();
  const parsed = articleSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid article." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("knowledge_base_articles")
    .update(parsed.data)
    .eq("id", id);

  if (error) return { error: "Could not update the article." };
  revalidatePath("/agents");
  return {};
}

export async function deleteKbArticle(id: string): Promise<KbActionResult> {
  await requireActiveTeamMember();
  const supabase = await createClient();
  const { error } = await supabase.from("knowledge_base_articles").delete().eq("id", id);

  if (error) return { error: "Could not delete the article." };
  revalidatePath("/agents");
  return {};
}

/** Inserts the sample articles that aren't already present (matched by title). */
export async function seedSampleKbArticles(): Promise<KbActionResult & { inserted?: number }> {
  const { email } = await requireActiveTeamMember();
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("knowledge_base_articles")
    .select("title")
    .in("title", SAMPLE_KB_ARTICLES.map((a) => a.title));
  if (readError) return { error: "Could not read the knowledge base." };

  const existingTitles = new Set((existing ?? []).map((row) => row.title));
  const rows = SAMPLE_KB_ARTICLES.filter((a) => !existingTitles.has(a.title)).map((a) => ({
    ...a,
    created_by: email,
    metadata: { sample: true },
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from("knowledge_base_articles").insert(rows);
    if (error) return { error: "Could not add the sample articles." };
  }

  revalidatePath("/agents");
  return { inserted: rows.length };
}

const MAX_IMPORT_BYTES = 1_000_000;

export interface KbImportResult {
  error?: string;
  created?: number;
  updated?: number;
  /** Articles skipped because of a problem in the file. */
  errors?: KbImportIssue[];
  warnings?: KbImportIssue[];
}

/**
 * Bulk import from a Markdown file (see src/lib/mastra/kb-import.ts for the
 * format). An article whose title matches an existing one (case-insensitive)
 * is updated in place, so a corrected file can be re-imported safely.
 */
export async function importKbMarkdown(markdown: string): Promise<KbImportResult> {
  const { email } = await requireActiveTeamMember();
  if (typeof markdown !== "string" || markdown.length === 0) return { error: "The file is empty." };
  if (markdown.length > MAX_IMPORT_BYTES) return { error: "The file is too large (max 1 MB)." };

  const parsed = parseKbMarkdown(markdown);
  if (parsed.articles.length === 0) {
    return { error: parsed.errors[0]?.message ?? "No articles found.", errors: parsed.errors };
  }

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase.from("knowledge_base_articles").select("id, title");
  if (readError) return { error: "Could not read the knowledge base." };
  const idByTitle = new Map((existing ?? []).map((a) => [a.title.trim().toLowerCase(), a.id]));

  const toInsert = parsed.articles
    .filter((a) => !idByTitle.has(a.title.toLowerCase()))
    .map((a) => ({ ...a, created_by: email, metadata: { imported: true } }));
  const toUpdate = parsed.articles.flatMap((a) => {
    const id = idByTitle.get(a.title.toLowerCase());
    return id ? [{ id, article: a }] : [];
  });

  if (toInsert.length > 0) {
    const { error } = await supabase.from("knowledge_base_articles").insert(toInsert);
    if (error) return { error: "Could not save the new articles.", errors: parsed.errors, warnings: parsed.warnings };
  }
  for (const { id, article } of toUpdate) {
    const { error } = await supabase
      .from("knowledge_base_articles")
      .update({ title: article.title, category: article.category, tags: article.tags, content: article.content })
      .eq("id", id);
    if (error) {
      return {
        error: `Saved some articles, but "${article.title}" failed to update.`,
        created: toInsert.length,
        errors: parsed.errors,
        warnings: parsed.warnings,
      };
    }
  }

  revalidatePath("/agents");
  return { created: toInsert.length, updated: toUpdate.length, errors: parsed.errors, warnings: parsed.warnings };
}
