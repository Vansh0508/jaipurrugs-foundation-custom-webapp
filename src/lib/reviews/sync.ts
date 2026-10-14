import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/supabase";
import { organizeReviews, type OrganizedReview, type OrganizedReviews } from "./agent";
import { reviewDedupeKey } from "./dedupe";
import { scrapeReviewsPage } from "./firecrawl";
import { REVIEW_SYNC_URLS, type ReviewSource } from "./sources";

export type ReviewSyncResult =
  | { ok: true; found: number; inserted: number }
  | { ok: false; error: string };

type ReviewInsert = Database["public"]["Tables"]["reviews"]["Insert"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    avatarUrl: avatar && /^https:\/\//.test(avatar) ? avatar : null,
  };
}

/** Scrapes the source page, has the organizer agent turn it into reviews, and stores the new ones. */
export async function syncReviews(source: ReviewSource, supabase: SupabaseClient<Database>): Promise<ReviewSyncResult> {
  const url = REVIEW_SYNC_URLS[source];
  if (!url) return { ok: false, error: "This source has no sync URL configured yet." };

  const { data: latestRow, error: latestError } = await supabase
    .from("reviews")
    .select("reviewer_name, review_text, reviewed_at")
    .eq("source", source)
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return { ok: false, error: "Could not read the existing reviews." };

  const scraped = await scrapeReviewsPage(url);
  if (!scraped.ok) return { ok: false, error: `Could not fetch the reviews page: ${scraped.reason}` };

  let organized;
  try {
    organized = await organizeReviews({
      source,
      markdown: scraped.markdown,
      latestStored: latestRow
        ? { reviewerName: latestRow.reviewer_name, reviewText: latestRow.review_text, reviewedAt: latestRow.reviewed_at }
        : null,
    });
  } catch (err) {
    console.error("[reviews] organizer agent failed", err);
    return { ok: false, error: "The review agent failed to process the page. Check OPENAI_API_KEY and try again." };
  }

  // Nothing recognisable on the page means the scrape failed (login wall, bot check, layout change)
  // — different from "nothing new", which still reports reviewsOnPage > 0.
  if (organized.reviewsOnPage === 0) {
    return { ok: false, error: "No reviews were found on the page. Airbnb may have blocked the fetch — try again shortly." };
  }

  return storeNewReviews(source, supabase, organized, latestRow?.reviewed_at ?? null);
}

/**
 * Saves the reviews that are new. Enforced here in code rather than trusted to the model: a review
 * is skipped if it is already stored (same dedupe key) or dated before the most recent stored review.
 */
export async function storeNewReviews(
  source: ReviewSource,
  supabase: SupabaseClient<Database>,
  organized: OrganizedReviews,
  latestDate: string | null,
): Promise<ReviewSyncResult> {
  const url = REVIEW_SYNC_URLS[source] ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const candidates = organized.reviews
    .map((r) => sanitize(r, today))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => ({ ...r, key: reviewDedupeKey(source, r.reviewerName, r.text) }));
  if (candidates.length === 0) return { ok: true, found: Math.max(organized.reviewsOnPage, organized.reviews.length), inserted: 0 };

  const { data: existing, error: existingError } = await supabase
    .from("reviews")
    .select("dedupe_key")
    .eq("source", source)
    .in("dedupe_key", candidates.map((c) => c.key));
  if (existingError) return { ok: false, error: "Could not check which reviews are already saved." };
  const existingKeys = new Set(existing.map((e) => e.dedupe_key));

  const fresh = candidates.filter(
    (c) => !existingKeys.has(c.key) && (latestDate === null || c.reviewedAt === null || c.reviewedAt >= latestDate),
  );
  if (fresh.length === 0) return { ok: true, found: Math.max(organized.reviewsOnPage, organized.reviews.length), inserted: 0 };

  const rows: ReviewInsert[] = fresh.map((c) => ({
    source,
    source_url: url,
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

  return { ok: true, found: Math.max(organized.reviewsOnPage, organized.reviews.length), inserted: rows.length };
}
