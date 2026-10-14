// Review sources. Client-safe (labels are used by the cards and the filter); the scraping
// itself lives in server-only modules.
export type ReviewSource = "airbnb" | "tripadvisor";

export const REVIEW_SOURCE_LABELS: Record<ReviewSource, string> = {
  airbnb: "Airbnb",
  tripadvisor: "TripAdvisor",
};

export function isReviewSource(value: string): value is ReviewSource {
  return value in REVIEW_SOURCE_LABELS;
}

/** One page (or one paginated listing) that a source's Sync button fetches. */
export type ReviewSyncTarget = {
  /** Shown in error messages, e.g. which TripAdvisor listing failed. */
  label: string;
  url: string;
  /** Reviews load in a scrolling modal (Airbnb): scroll it so they all load. */
  scrollModal?: boolean;
  /** Review text is cut off behind a "Read more" button (TripAdvisor): expand it before reading. */
  expandReadMore?: boolean;
  /**
   * Heading that starts the real review list. Everything before it (a highlights block that repeats
   * the same reviews on every page, "nearby experiences", ...) is cut so the agent reads only the
   * reviews of this page; on a ~100k-character page it otherwise latches onto the highlights.
   */
  reviewsHeading?: string;
  /** Reviews are split across numbered pages (TripAdvisor: 10 per page, `-Reviews-or10-`). */
  pagination?: { pageSize: number; maxPages: number };
};

// Only sources with targets here get a working Sync button.
export const REVIEW_SYNC_TARGETS: Partial<Record<ReviewSource, ReviewSyncTarget[]>> = {
  airbnb: [
    {
      label: "Airbnb experience",
      url: "https://www.airbnb.co.in/experiences/435181?adults=2&checkin=2026-10-22&checkout=2026-10-24&currentTab=experience_tab&federatedSearchId=0a44c410-65ac-49e6-8244-f7975b39368d&searchId=6949ef06-0423-433e-98f6-fd864b316229&sectionId=7916f153-ff15-4db9-9530-91f8454c0b18&modal=reviews",
      scrollModal: true,
    },
  ],
  tripadvisor: [
    {
      label: "TripAdvisor — Jaipur Rugs Village Tour",
      url: "https://www.tripadvisor.in/Attraction_Review-g32953624-d33249077-Reviews-Jaipur_Rugs_Village_Tour-Manpura_Macheri_Jaipur_District_Rajasthan.html",
      expandReadMore: true,
      reviewsHeading: "## Reviews",
      pagination: { pageSize: 10, maxPages: 3 },
    },
    {
      label: "TripAdvisor — Jaipur Rugs",
      url: "https://www.tripadvisor.in/Attraction_Review-g304555-d10261594-Reviews-Jaipur_Rugs-Jaipur_Jaipur_District_Rajasthan.html",
      expandReadMore: true,
      reviewsHeading: "## Reviews",
      // 123 reviews at the time of writing; 15 pages = 150 leaves room to grow.
      pagination: { pageSize: 10, maxPages: 15 },
    },
  ],
};

/** URL of a page of a paginated listing; page 0 is the listing itself. */
export function reviewPageUrl(target: ReviewSyncTarget, pageIndex: number) {
  if (!target.pagination || pageIndex === 0) return target.url;
  return target.url.replace("-Reviews-", `-Reviews-or${pageIndex * target.pagination.pageSize}-`);
}
