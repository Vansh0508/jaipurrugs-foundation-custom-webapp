import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/supabase";
import { organizeReviews, type OrganizedReview, type OrganizedReviews } from "./agent";
import { reviewDedupeKey } from "./dedupe";
import { scrapeReviewsPage } from "./firecrawl";
import { REVIEW_SYNC_TARGETS, reviewPageUrl, type ReviewSource, type ReviewSyncTarget } from "./sources";

export type ReviewSyncResult =
  | { ok: true; found: number; inserted: number; warning?: string }
  // `inserted` lets the caller still refresh the list when an earlier target saved reviews before a later one failed.
  | { ok: false; error: string; inserted?: number };

type ReviewInsert = Database["public"]["Tables"]["reviews"]["Insert"];
type Db = SupabaseClient<Database>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// Pages after the first are fetched this many at a time (each is a Firecrawl scrape + an agent call).
const PAGE_CONCURRENCY = 3;

/** Cleans what the model returned: drops unusable rows, rejects bad dates/URLs. */
function sanitize(review: OrganizedReview, today: string) {
  const reviewerName = review.reviewerName.trim();
  const text = review.text.trim();
  if (!reviewerName || !text) return null;
  const date = review.reviewedAt && ISO_DATE.test(review.reviewedAt) && review.reviewedAt <= today ? review.reviewedAt : null;
  const avatar = review.avatarUrl?.trim();
  return {
    reviewerName,
    text,
    reviewedAt: date,
    rating: review.rating,
    // A generic silhouette is worse than initials, so placeholder avatars are dropped.
    avatarUrl: avatar && /^https:\/\//.test(avatar) && !/default-avatar/i.test(avatar) ? avatar : null,
  };
}

/** "Showing results 1-10 of 123" (TripAdvisor) → 123. */
function totalReviewsFromMarkdown(markdown: string) {
  const match = markdown.match(/Showing results\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)/i);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

/** Keeps just the review list: from `heading` to the "Showing results" line. Unchanged if the heading is missing. */
function reviewsSection(markdown: string, heading: string | undefined) {
  if (!heading) return markdown;
  const start = markdown.split("\n").findIndex((line) => line.trim() === heading);
  if (start === -1) return markdown;
  const section = markdown.split("\n").slice(start).join("\n");
  const end = section.match(/Showing results[^\n]*/);
  return end ? section.slice(0, (end.index ?? 0) + end[0].length) : section;
}

/**
 * Saves the reviews that are new. Enforced here in code rather than trusted to the model: a review
 * is skipped if it is already stored (same dedupe key) or dated before the most recent stored
 * review of the same listing.
 */
export async function storeNewReviews(
  source: ReviewSource,
  supabase: Db,
  organized: OrganizedReviews,
  latestDate: string | null,
  sourceUrl: string | null,
): Promise<ReviewSyncResult> {
  const found = Math.max(organized.reviewsOnPage, organized.reviews.length);
  const today = new Date().toISOString().slice(0, 10);
  const candidates = organized.reviews
    .map((r) => sanitize(r, today))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => ({ ...r, key: reviewDedupeKey(source, r.reviewerName, r.text) }));
  if (candidates.length === 0) return { ok: true, found, inserted: 0 };

  const { data: existing, error: existingError } = await supabase
    .from("reviews")
    .select("dedupe_key")
    .eq("source", source)
    .in("dedupe_key", candidates.map((c) => c.key));
  if (existingError) return { ok: false, error: "Could not check which reviews are already saved." };
  const existingKeys = new Set(existing.map((e) => e.dedupe_key));

  // The same review can appear twice on one page (e.g. a highlights list and the full list).
  const seen = new Set<string>();
  const fresh = candidates.filter((c) => {
    if (existingKeys.has(c.key) || seen.has(c.key)) return false;
    seen.add(c.key);
    return latestDate === null || c.reviewedAt === null || c.reviewedAt >= latestDate;
  });
  if (fresh.length === 0) return { ok: true, found, inserted: 0 };

  const rows: ReviewInsert[] = fresh.map((c) => ({
    source,
    source_url: sourceUrl,
    dedupe_key: c.key,
    reviewer_name: c.reviewerName,
    reviewer_avatar_url: c.avatarUrl,
    rating: c.rating,
    review_text: c.text,
    reviewed_at: c.reviewedAt,
  }));
  const { error: insertError } = await supabase
    .from("reviews")
    .upsert(rows, { onConflict: "source,dedupe_key", ignoreDuplicates: true });
  if (insertError) return { ok: false, error: "Could not save the new reviews." };

  return { ok: true, found, inserted: rows.length };
}

type LatestStored = { reviewerName: string; reviewText: string; reviewedAt: string | null };

// "Latest" is per listing (source_url): a newer review on one TripAdvisor listing must not make
// an older, still-unsaved review on the other look already-covered.
async function loadLatestStored(supabase: Db, source: ReviewSource, url: string): Promise<LatestStored | null | "error"> {
  const { data, error } = await supabase
    .from("reviews")
    .select("reviewer_name, review_text, reviewed_at")
    .eq("source", source)
    .eq("source_url", url)
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return "error";
  return data ? { reviewerName: data.reviewer_name, reviewText: data.review_text, reviewedAt: data.reviewed_at } : null;
}

type ScrapeOutcome = { ok: true; markdown: string } | { ok: false; error: string };
type OrganizeOutcome = { ok: true; organized: OrganizedReviews } | { ok: false; error: string };

async function scrapePage(target: ReviewSyncTarget, pageIndex: number): Promise<ScrapeOutcome> {
  const scraped = await scrapeReviewsPage(reviewPageUrl(target, pageIndex), target);
  if (!scraped.ok) return { ok: false, error: `Could not fetch the reviews page: ${scraped.reason}` };
  return { ok: true, markdown: reviewsSection(scraped.markdown, target.reviewsHeading) };
}

async function organizePage(source: ReviewSource, markdown: string, latestStored: LatestStored | null): Promise<OrganizeOutcome> {
  try {
    return { ok: true, organized: await organizeReviews({ source, markdown, latestStored }) };
  } catch (err) {
    console.error("[reviews] organizer agent failed", err);
    return { ok: false, error: "The review agent failed to process the page. Check OPENAI_API_KEY and try again." };
  }
}

async function fetchPage(source: ReviewSource, target: ReviewSyncTarget, pageIndex: number, latestStored: LatestStored | null) {
  const scraped = await scrapePage(target, pageIndex);
  if (!scraped.ok) return scraped;
  return organizePage(source, scraped.markdown, latestStored);
}

// A listing counts as fully synced once we hold at least this share of the reviews the site reports
// (the site's total can include reviews we can't extract, so don't demand exactly 100%).
const COMPLETE_SHARE = 0.95;

async function syncTarget(source: ReviewSource, target: ReviewSyncTarget, supabase: Db): Promise<ReviewSyncResult> {
  const latest = await loadLatestStored(supabase, source, target.url);
  if (latest === "error") return { ok: false, error: "Could not read the existing reviews." };

  // First page on its own: a routine re-sync (nothing new) then costs a single scrape.
  const scrapedFirst = await scrapePage(target, 0);
  if (!scrapedFirst.ok) return { ok: false, error: scrapedFirst.error };
  const total = totalReviewsFromMarkdown(scrapedFirst.markdown);

  // Incomplete = we hold clearly fewer reviews than the site reports (e.g. an earlier sync was cut
  // short). Then the "newest first, stop at what we have" shortcut would leave the gap forever, so
  // backfill: read every page and rely on the dedupe key alone.
  let backfill = false;
  if (target.pagination && total) {
    const { count, error } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .eq("source", source)
      .eq("source_url", target.url);
    if (error) return { ok: false, error: "Could not read the existing reviews." };
    backfill = (count ?? 0) < total * COMPLETE_SHARE;
  }
  const knownLatest = backfill ? null : latest;
  const latestDate = knownLatest?.reviewedAt ?? null;

  const first = await organizePage(source, scrapedFirst.markdown, knownLatest);
  if (!first.ok) return { ok: false, error: first.error };
  // Nothing recognisable on the page means the scrape failed (login wall, bot check, layout change)
  // — different from "nothing new", which still reports reviewsOnPage > 0.
  if (first.organized.reviewsOnPage === 0) {
    return { ok: false, error: "No reviews were found on the page. The site may have blocked the fetch — try again shortly." };
  }
  const stored = await storeNewReviews(source, supabase, first.organized, latestDate, target.url);
  if (!stored.ok || !target.pagination) return stored;

  let found = stored.found;
  let inserted = stored.inserted;
  // Reviews are newest-first, so (outside a backfill) a page with nothing new means everything after it is already saved.
  if (inserted === 0 && !backfill) return { ok: true, found, inserted };

  const pageCount = Math.min(
    target.pagination.maxPages,
    total ? Math.ceil(total / target.pagination.pageSize) : target.pagination.maxPages,
  );

  let warning: string | undefined;
  for (let start = 1; start < pageCount && !warning; start += PAGE_CONCURRENCY) {
    const indexes = Array.from({ length: Math.min(PAGE_CONCURRENCY, pageCount - start) }, (_, i) => start + i);
    const pages = await Promise.all(indexes.map((i) => fetchPage(source, target, i, knownLatest)));

    let reachedKnown = false;
    for (const [k, page] of pages.entries()) {
      if (!page.ok) {
        warning = `${target.label}: stopped at page ${indexes[k] + 1} — ${page.error}`;
        break;
      }
      if (page.organized.reviewsOnPage === 0) {
        reachedKnown = true; // ran past the last page
        continue;
      }
      const result = await storeNewReviews(source, supabase, page.organized, latestDate, target.url);
      if (!result.ok) return { ok: false, error: result.error, inserted };
      found += result.found;
      inserted += result.inserted;
      if (result.inserted === 0 && !backfill) reachedKnown = true;
    }
    if (reachedKnown) break;
  }
  return { ok: true, found, inserted, warning };
}

/** Fetches every listing configured for `source`, has the organizer agent structure it, and stores the new reviews. */
export async function syncReviews(source: ReviewSource, supabase: Db): Promise<ReviewSyncResult> {
  const targets = REVIEW_SYNC_TARGETS[source];
  if (!targets?.length) return { ok: false, error: "This source has no sync URL configured yet." };

  let found = 0;
  let inserted = 0;
  const warnings: string[] = [];
  for (const target of targets) {
    const result = await syncTarget(source, target, supabase);
    if (!result.ok) {
      const prefix = targets.length > 1 ? `${target.label}: ` : "";
      return { ok: false, error: prefix + result.error, inserted: inserted + (result.inserted ?? 0) };
    }
    found += result.found;
    inserted += result.inserted;
    if (result.warning) warnings.push(result.warning);
  }
  return { ok: true, found, inserted, warning: warnings.length ? warnings.join(" ") : undefined };
}
