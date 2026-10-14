// Review sources. Client-safe (labels are used by the cards and the filter); the scraping
// itself lives in server-only modules.
export type ReviewSource = "airbnb" | "tripadvisor";

export const REVIEW_SOURCE_LABELS: Record<ReviewSource, string> = {
  airbnb: "Airbnb",
  tripadvisor: "TripAdvisor",
};

// Only sources with a URL here get a working Sync button.
export const REVIEW_SYNC_URLS: Partial<Record<ReviewSource, string>> = {
  airbnb:
    "https://www.airbnb.co.in/experiences/435181?adults=2&checkin=2026-10-22&checkout=2026-10-24&currentTab=experience_tab&federatedSearchId=0a44c410-65ac-49e6-8244-f7975b39368d&searchId=6949ef06-0423-433e-98f6-fd864b316229&sectionId=7916f153-ff15-4db9-9530-91f8454c0b18&modal=reviews",
};

export function isReviewSource(value: string): value is ReviewSource {
  return value in REVIEW_SOURCE_LABELS;
}
