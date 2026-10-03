import { KB_CATEGORIES } from "@/lib/mastra/kb-categories";

// Markdown format for bulk-importing knowledge base articles:
//
//   # Any title (ignored)
//   Anything before the first "## " heading is ignored (notes, a preamble).
//
//   ## Article title
//   category: rural_experience
//   tags: pricing, cost, rupees
//
//   The article body, in Markdown or plain text…
//
// One level-2 heading per article. `category:` and `tags:` are optional and
// must come directly under the heading. Level-3+ headings stay in the body.

export const MAX_IMPORT_ARTICLES = 200;
export const MAX_TITLE = 200;
export const MAX_CONTENT = 20000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;

export interface ParsedKbArticle {
  title: string;
  category: string;
  tags: string[];
  content: string;
}

export interface KbImportIssue {
  /** Article title, or "(file)" for problems that aren't tied to one article. */
  title: string;
  message: string;
}

export interface ParsedKbImport {
  articles: ParsedKbArticle[];
  /** Problems that skip an article (empty body, too long, duplicate title). */
  errors: KbImportIssue[];
  /** Fixed up automatically (unknown category → general). */
  warnings: KbImportIssue[];
}

const CATEGORY_IDS = new Set<string>(KB_CATEGORIES.map((c) => c.id));

function parseTags(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(",")
        .map((t) => t.trim().toLowerCase().replace(/^#/, ""))
        .filter(Boolean)
        .map((t) => t.slice(0, MAX_TAG_LENGTH)),
    ),
  ].slice(0, MAX_TAGS);
}

export function parseKbMarkdown(markdown: string): ParsedKbImport {
  const result: ParsedKbImport = { articles: [], errors: [], warnings: [] };
  const lines = markdown.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");

  // Split into sections on "## Title" (but not "### …"), ignoring fenced code.
  const sections: { title: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const heading = !inFence ? /^##\s+(.+?)\s*#*\s*$/.exec(line) : null;
    if (heading && !line.startsWith("###")) {
      sections.push({ title: heading[1].trim(), lines: [] });
    } else if (sections.length > 0) {
      sections[sections.length - 1].lines.push(line);
    }
  }

  if (sections.length === 0) {
    result.errors.push({ title: "(file)", message: 'No articles found — each article starts with a "## Title" heading.' });
    return result;
  }

  const seen = new Set<string>();
  for (const section of sections) {
    const { title } = section;
    const body = [...section.lines];

    // Optional metadata lines directly under the heading (blank lines allowed before them).
    let category = "general";
    let tags: string[] = [];
    let index = 0;
    while (index < body.length && body[index].trim() === "") index++;
    for (; index < body.length; index++) {
      const meta = /^(category|tags)\s*:\s*(.*)$/i.exec(body[index].trim());
      if (!meta) break;
      if (meta[1].toLowerCase() === "category") {
        const id = meta[2].trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (CATEGORY_IDS.has(id)) category = id;
        else if (id) {
          result.warnings.push({ title, message: `Unknown category "${meta[2].trim()}" — imported as "general".` });
        }
      } else {
        tags = parseTags(meta[2]);
      }
    }
    const content = body.slice(index).join("\n").trim();

    if (!title) {
      result.errors.push({ title: "(untitled)", message: "A heading has no title." });
    } else if (title.length > MAX_TITLE) {
      result.errors.push({ title: title.slice(0, 60) + "…", message: `Title is longer than ${MAX_TITLE} characters.` });
    } else if (!content) {
      result.errors.push({ title, message: "No body text under the heading." });
    } else if (content.length > MAX_CONTENT) {
      result.errors.push({ title, message: `Body is longer than ${MAX_CONTENT} characters — split it into two articles.` });
    } else if (seen.has(title.toLowerCase())) {
      result.errors.push({ title, message: "Duplicate title in the file — titles must be unique." });
    } else {
      seen.add(title.toLowerCase());
      result.articles.push({ title, category, tags, content });
    }
  }

  if (result.articles.length > MAX_IMPORT_ARTICLES) {
    result.errors.push({ title: "(file)", message: `Too many articles (max ${MAX_IMPORT_ARTICLES} per import).` });
    result.articles = [];
  }
  return result;
}
